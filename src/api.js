// ===== API Client =====

import state from './state.js';
import { getCurrentConversation } from './conversations.js';

export function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (state.settings.apiKey) {
        headers['Authorization'] = `Bearer ${state.settings.apiKey}`;
    }
    return headers;
}

export async function fetchModels() {
    const url = `${state.settings.serverUrl}/api/v1/models`;
    const resp = await fetch(url, { headers: getHeaders() });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data.models || [];
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

    const body = {
        model: conv?.model || state.settings.model,
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
        systemPrompt += `[Web Search Results]\nThe following are recent web search results relevant to the user's query. Use them to provide accurate, up-to-date information. Cite sources using [number] notation when referencing specific results.\n\n${searchContext}\n[/Web Search Results]\n\n`;
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

    const resp = await fetch(`${state.settings.serverUrl}/api/v1/chat`, {
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
