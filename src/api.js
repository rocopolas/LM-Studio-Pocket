// ===== API Client =====

import state from './state.js';
import { getCurrentConversation } from './conversations.js';
import { getActiveSkillPrompt } from './skills.js';

export function getHeaders() {
    const headers = {
        'Content-Type': 'application/json',
        'X-Target-Url': state.settings.serverUrl
    };
    if (state.settings.apiKey) {
        headers['Authorization'] = `Bearer ${state.settings.apiKey}`;
    }
    return headers;
}

export async function fetchModels() {
    if (!state.settings.serverUrl) return [];

    // Fetch all downloaded models
    const urlAll = `/api/models`;
    const respAll = await fetch(urlAll, { headers: getHeaders() });
    if (!respAll.ok) throw new Error(`HTTP ${respAll.status}`);

    const dataAll = await respAll.json();
    const models = dataAll.models || [];

    return models;
}

export async function sendChatStream(messages, onEvent, searchContext = '', conversationId, assistantMsgId) {
    const conv = getCurrentConversation();
    const input = [];

    // Build input array from message history
    for (const msg of messages) {
        if (msg.role === 'user') {
            if (msg.images && msg.images.length > 0) {
                const contentParts = [];
                for (const img of msg.images) {
                    contentParts.push({ type: 'image_url', image_url: { url: img } });
                }
                contentParts.push({ type: 'text', text: msg.text });
                input.push({ role: 'user', content: contentParts });
            } else {
                input.push({ role: 'user', content: msg.text });
            }
        } else if (msg.role === 'assistant') {
            input.push({ role: 'assistant', content: msg.text });
        }
    }

    const selectedModelKey = conv?.model || state.settings.model;
    let targetModelId = selectedModelKey;
    if (state.models && state.models.length > 0) {
        const modelInfo = state.models.find(m =>
            m.key === selectedModelKey ||
            m.key.endsWith(selectedModelKey) ||
            (m.variants && m.variants.some(v => v.includes(selectedModelKey)))
        );
        if (modelInfo) {
            targetModelId = modelInfo.key;
            if (modelInfo.loaded_instances && modelInfo.loaded_instances.length > 0) {
                targetModelId = modelInfo.loaded_instances[0].id;
            }
        }
    }

    const isDeepResearch = state.settings.deepResearcherEnabled;

    let systemPrompt = '';
    if (isDeepResearch) {
        systemPrompt += `You are a Deep Autonomous Researcher. 
Your objective is to write an exhaustive, highly detailed academic report (aiming for ~5 pages or minimum 2000-3000 words) in the exact language of the user's prompt. 
You MUST cross-reference all the provided sources. 
For each source you use, you MUST evaluate its credibility using the CRAAP criteria (Currency, Relevance, Authority, Accuracy, Purpose). Mention these evaluations in your analysis where relevant.
FORMATTING REQUIREMENTS:
1. Use professional, academic markdown with clear hierarchical headers.
2. Use APA format for in-text citations (e.g. Author, Year) mapping to the provided sources.
3. Include a comprehensive 'References' or 'Bibliography' section at the end in full APA format.
4. If asked an analytical question, explore counter-arguments and synthesize the data from multiple points of view.\n\n`;
    } else {
        // Inject active skill prompt (if any) before user's system prompt
        const skillPrompt = getActiveSkillPrompt();
        if (skillPrompt) {
            systemPrompt += skillPrompt + '\n\n';
        }
        if (state.settings.systemPrompt) {
            systemPrompt += state.settings.systemPrompt + '\n\n';
        }
    }

    if (state.settings.memoryEnabled && state.settings.memory.trim()) {
        systemPrompt += `[User Memory]\n${state.settings.memory.trim()}\n[/User Memory]\n\n`;
    }
    if (state.settings.memoryEnabled && !isDeepResearch) {
        systemPrompt += `[Memory Instructions]\nYou have the ability to remember important information about the user across conversations. When the user shares personal details, preferences, or important context, you can acknowledge it naturally (e.g., "I'll remember that"). The memory system works automatically.\n[/Memory Instructions]\n\n`;
    }

    const body = {
        modelOptions: {
            model: targetModelId,
            temperature: state.settings.temperature,
            topTokens: state.settings.topK,
            topP: state.settings.topP,
            minP: state.settings.minP,
            repeatPenalty: state.settings.repeatPenalty,
            maxTokens: isDeepResearch ? Math.max(8192, state.settings.maxTokens) : state.settings.maxTokens,
            contextLength: state.settings.contextLength,
            deepResearcherEnabled: isDeepResearch
        },
        messages: input,
        systemPrompt: systemPrompt.trim(),
        conversationId: conversationId,
        assistantMsgId: assistantMsgId,
        lmUrl: state.settings.serverUrl,
        searchContext: searchContext || ''
    };

    state.abortController = new AbortController();

    return new Promise((resolve, reject) => {
        const es = new EventSource(`/api/stream/${conversationId}`);
        let fetchStarted = false;

        es.addEventListener('open', async () => {
            if (fetchStarted) return;
            fetchStarted = true;

            try {
                const resp = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: state.abortController.signal,
                });

                if (!resp.ok) {
                    const errorText = await resp.text();
                    es.close();
                    reject(new Error(`Failed to start backend generation: ${resp.status} - ${errorText}`));
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    es.close();
                    reject(err);
                }
            }
        });

        const attachEvent = (eventName) => {
            es.addEventListener(eventName, (event) => {
                try {
                    const data = JSON.parse(event.data);
                    onEvent(eventName, data);
                } catch (e) { }

                if (eventName === 'chat.end') {
                    es.close();
                    resolve();
                } else if (eventName === 'error') {
                    es.close();
                    reject(new Error(JSON.parse(event.data).error?.message || 'Stream error'));
                }
            });
        };

        const eventsToListen = [
            'model_load.start', 'model_load.progress',
            'reasoning.start', 'reasoning.delta', 'reasoning.end',
            'message.start', 'message.delta', 'message.end',
            'prompt_processing.start', 'chat.end', 'error'
        ];

        eventsToListen.forEach(attachEvent);

        state.abortController.signal.addEventListener('abort', () => {
            es.close();
            const abortErr = new Error("Aborted");
            abortErr.name = 'AbortError';
            reject(abortErr);
        });
    });
}
