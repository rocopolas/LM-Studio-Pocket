// ===== API Client =====

import state from './state.js';
import { getCurrentConversation } from './conversations.js';

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
    const urlAll = `/api/proxy/api/v1/models`;
    const respAll = await fetch(urlAll, { headers: getHeaders() });
    if (!respAll.ok) throw new Error(`HTTP ${respAll.status}`);

    const dataAll = await respAll.json();
    const models = dataAll.models || [];

    return models;
}

export async function sendChatStream(messages, onEvent, searchContext = '') {
    const conv = getCurrentConversation();
    const input = [];

    // Build input array from message history
    for (const msg of messages) {
        if (msg.role === 'user') {
            if (msg.images && msg.images.length > 0) {
                for (const img of msg.images) {
                    input.push({ type: 'image', data_url: img });
                }
            }
            input.push({ type: 'text', content: msg.text });
        }
    }

    const selectedModelKey = conv?.model || state.settings.model;

    // Check if we have a specific loaded instance for this model to avoid double-loading
    // in LM Studio (which can happen if we send the generic key when it's already loaded under a specific ID).
    let targetModelId = selectedModelKey;
    if (state.models && state.models.length > 0) {
        const modelInfo = state.models.find(m =>
            m.key === selectedModelKey ||
            m.key.endsWith(selectedModelKey) ||
            (m.variants && m.variants.some(v => v.includes(selectedModelKey)))
        );
        if (modelInfo) {
            targetModelId = modelInfo.key; // Always upgrade to full native key
            if (modelInfo.loaded_instances && modelInfo.loaded_instances.length > 0) {
                targetModelId = modelInfo.loaded_instances[0].id;
            }
        }
    }

    const body = {
        model: targetModelId,
        input: input,
        stream: true,
        temperature: state.settings.temperature,
        top_p: state.settings.topP,
        top_k: state.settings.topK,
        min_p: state.settings.minP,
        repeat_penalty: state.settings.repeatPenalty,
        max_output_tokens: state.settings.maxTokens,
        context_length: state.settings.contextLength,
    };

    // Build system prompt: search context + memory + user prompt
    let systemPrompt = '';

    if (searchContext) {
        if (state.settings.crawl4aiEnabled) {
            systemPrompt += `[Web Search Results]\nThe following contains the FULL SCRAPED TEXT content of the webpages relevant to the user's query (not just summaries). You CAN read the full content of these sites. Use them to provide accurate, up-to-date information. Cite sources using [number] notation when referencing specific results.\n\n${searchContext}\n[/Web Search Results]\n\n`;
        } else {
            systemPrompt += `[Web Search Results]\nThe following are recent web search results relevant to the user's query. Use them to provide accurate, up-to-date information. Cite sources using [number] notation when referencing specific results.\n\n${searchContext}\n[/Web Search Results]\n\n`;
        }
    }

    if (state.settings.memoryEnabled && state.settings.memory.trim()) {
        systemPrompt += `[User Memory]\n${state.settings.memory.trim()}\n[/User Memory]\n\n`;
    }
    if (state.settings.memoryEnabled) {
        systemPrompt += `[Memory Instructions]\nYou have the ability to remember important information about the user across conversations. When the user shares personal details, preferences, or important context, you can acknowledge it naturally (e.g., "I'll remember that"). The memory system works automatically.\n[/Memory Instructions]\n\n`;
    }
    if (state.settings.systemPrompt) {
        systemPrompt += state.settings.systemPrompt;
    }

    if (systemPrompt) {
        body.system_prompt = systemPrompt;
    }

    // Use stateful chats: pass previous response ID
    if (conv && conv.lastResponseId) {
        body.previous_response_id = conv.lastResponseId;
        const lastUserMsg = messages[messages.length - 1];
        body.input = [];
        if (lastUserMsg.images && lastUserMsg.images.length > 0) {
            for (const img of lastUserMsg.images) {
                body.input.push({ type: 'image', data_url: img });
            }
        }
        body.input.push({ type: 'text', content: lastUserMsg.text });
    }

    state.abortController = new AbortController();

    const resp = await fetch(`/api/proxy/api/v1/chat`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
        signal: state.abortController.signal,
    });

    if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${errorText}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = null;
        for (const line of lines) {
            if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ') && currentEvent) {
                try {
                    const data = JSON.parse(line.slice(6));
                    onEvent(currentEvent, data);
                } catch (_) { }
                currentEvent = null;
            }
        }
    }
}
