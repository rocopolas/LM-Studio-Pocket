// ===== Send Message & Chat Control =====

import { CONFIG } from './config.js';
import { DOM } from './dom.js';
import state from './state.js';
import { generateId, showToast } from './utils.js';
import { renderMarkdown } from './markdown.js';
import { saveConversations } from './storage.js';
import { sendChatStream } from './api.js';
import { getCurrentConversation, createConversation, updateConversationTitle, renderChat } from './conversations.js';
import { appendMessageToDOM, scrollToBottom, buildTypingHtml, buildStatsHtml, buildReasoningHtml, buildSearchSourcesHtml, getActiveModel, updateSendButton, updateQueueBadge } from './ui.js';
import { renderImagePreviews } from './images.js';
import { extractAndSaveMemory } from './memory.js';
import { searchWeb } from './search.js';

export async function sendMessage() {
    const text = DOM.messageInput.value.trim();
    if (!text && state.pendingImages.length === 0) return;
    if (!state.settings.model && !getActiveModel()) {
        showToast('Select a model in Settings or the chat selector', 'warning');
        return;
    }

    // If generating, queue the message and show it visually
    if (state.isGenerating) {
        const queuedImages = state.pendingImages.map(i => i.dataUrl);
        state.messageQueue.push({
            text: text,
            images: queuedImages,
        });

        DOM.messageInput.value = '';
        DOM.messageInput.style.height = 'auto';
        state.pendingImages = [];
        renderImagePreviews();
        updateSendButton();

        let conv = getCurrentConversation();
        if (!conv) conv = createConversation();
        const queuedMsg = {
            id: generateId(),
            role: 'user',
            text: text,
            images: queuedImages,
            timestamp: Date.now(),
            queued: true,
        };
        conv.messages.push(queuedMsg);
        const queuedDiv = appendMessageToDOM(queuedMsg);
        queuedDiv.classList.add('queued');
        const badge = document.createElement('div');
        badge.className = 'queued-badge';
        badge.innerHTML = '⏳ Queued';
        queuedDiv.querySelector('.message-content').appendChild(badge);
        scrollToBottom();
        saveConversations();
        updateConversationTitle(conv);
        updateQueueBadge();
        return;
    }

    let conv = getCurrentConversation();
    if (!conv) {
        conv = createConversation();
    }

    DOM.welcomeScreen.classList.add('hidden');

    const userMsg = {
        id: generateId(),
        role: 'user',
        text: text,
        images: state.pendingImages.map(i => i.dataUrl),
        timestamp: Date.now(),
    };

    conv.messages.push(userMsg);
    appendMessageToDOM(userMsg);
    scrollToBottom();

    DOM.messageInput.value = '';
    DOM.messageInput.style.height = 'auto';
    state.pendingImages = [];
    renderImagePreviews();
    updateSendButton();

    updateConversationTitle(conv);

    const assistantMsg = {
        id: generateId(),
        role: 'assistant',
        text: '',
        reasoning: '',
        stats: null,
        sources: null,
        timestamp: Date.now(),
    };
    conv.messages.push(assistantMsg);
    const assistantDiv = appendMessageToDOM(assistantMsg);
    const textEl = assistantDiv.querySelector('.message-text');

    textEl.innerHTML = buildTypingHtml();
    scrollToBottom();

    state.isGenerating = true;
    state.generatingConvId = conv.id;
    DOM.btnSend.classList.add('hidden');
    DOM.btnStop.classList.remove('hidden');

    let messageText = '';
    let reasoningText = '';
    let isReasoning = false;
    let currentAssistantDiv = assistantDiv;
    const domOk = () => {
        if (!currentAssistantDiv.isConnected) {
            const newDiv = document.querySelector(`.message[data-id="${assistantMsg.id}"]`);
            if (newDiv) {
                currentAssistantDiv = newDiv;
            }
        }
        return currentAssistantDiv.isConnected;
    };

    const onStreamEvent = (eventType, data) => {
        const getTextEl = () => currentAssistantDiv.querySelector('.message-text');
        switch (eventType) {
            case 'reasoning.start':
                isReasoning = true;
                break;
            case 'reasoning.delta':
                reasoningText += data.content || '';
                assistantMsg.reasoning = reasoningText;
                if (domOk()) {
                    const contentEl = currentAssistantDiv.querySelector('.message-content');
                    let reasoningBlock = contentEl.querySelector('.reasoning-block');
                    if (!reasoningBlock) {
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = buildReasoningHtml(reasoningText, true);
                        reasoningBlock = tempDiv.firstElementChild;
                        contentEl.insertBefore(reasoningBlock, getTextEl());
                    } else {
                        const reasoningContentEl = reasoningBlock.querySelector('.reasoning-content');
                        if (reasoningContentEl) {
                            reasoningContentEl.innerHTML = renderMarkdown(reasoningText);
                        }
                    }
                    scrollToBottom();
                }
                break;
            case 'reasoning.end':
                isReasoning = false;
                if (reasoningText) {
                    assistantMsg.reasoning = reasoningText;
                }
                break;
            case 'message.start':
                if (domOk()) getTextEl().innerHTML = '';
                break;
            case 'message.delta':
                messageText += data.content || '';
                assistantMsg.text = messageText;
                if (domOk()) {
                    getTextEl().innerHTML = renderMarkdown(messageText);
                    scrollToBottom();
                }
                break;
            case 'message.end':
                assistantMsg.text = messageText;
                break;
            case 'chat.end':
                // If reasoning consumed all tokens with no actual response, clear typing indicator
                if (!messageText && domOk()) {
                    if (reasoningText) {
                        assistantMsg.text = '*⚠️ The model used all tokens in reasoning and did not generate a response. Try increasing Max Tokens in Settings.*';
                    } else {
                        assistantMsg.text = '';
                    }
                    getTextEl().innerHTML = renderMarkdown(assistantMsg.text);
                }
                if (data.result) {
                    assistantMsg.stats = data.result.stats;
                    if (data.result.response_id) {
                        conv.lastResponseId = data.result.response_id;
                    }
                    if (domOk() && assistantMsg.stats) {
                        const statsHtml = buildStatsHtml(assistantMsg.stats, assistantMsg.id);
                        if (statsHtml) {
                            const statsDiv = document.createElement('div');
                            statsDiv.innerHTML = statsHtml;
                            currentAssistantDiv.querySelector('.message-content').appendChild(statsDiv.firstElementChild);
                        }
                    }
                    // Render search sources
                    if (domOk() && assistantMsg.sources && assistantMsg.sources.length > 0) {
                        const sourcesHtml = buildSearchSourcesHtml(assistantMsg.sources);
                        if (sourcesHtml) {
                            const sourcesDiv = document.createElement('div');
                            sourcesDiv.innerHTML = sourcesHtml;
                            currentAssistantDiv.querySelector('.message-content').appendChild(sourcesDiv.firstElementChild);
                        }
                    }
                    if (state.settings.memoryEnabled && messageText) {
                        setTimeout(() => extractAndSaveMemory(text, messageText), CONFIG.MEMORY_DELAY_MS);
                    }
                }
                break;
            case 'error':
                showToast(data.error?.message || 'Unknown error', 'error');
                break;
            case 'prompt_processing.start':
                if (domOk()) getTextEl().innerHTML = buildTypingHtml('Processing prompt...');
                break;
            case 'model_load.start':
                if (domOk()) getTextEl().innerHTML = buildTypingHtml('Loading model...');
                break;
            case 'model_load.progress':
                if (domOk()) {
                    const pct = data.progress != null ? `${Math.round(data.progress * 100)}%` : '';
                    getTextEl().innerHTML = buildTypingHtml(`Loading model... ${pct}`);
                }
                break;
        }
    };

    const buildMsgs = () => conv.messages.filter(m => m.role === 'user').map(m => ({
        role: 'user', text: m.text, images: m.images,
    }));

    // Web search (if enabled)
    let searchContext = '';
    if (state.settings.searchEnabled) {
        try {
            if (domOk()) getTextEl().innerHTML = buildTypingHtml('🔍 Searching the web...');
            const searchResult = await searchWeb(text);
            searchContext = searchResult.contextText;
            if (searchResult.results.length > 0) {
                assistantMsg.sources = searchResult.results;
            }
        } catch (err) {
            console.warn('Web search failed:', err.message);
            showToast(`Search failed: ${err.message}`, 'warning');
        }
        if (domOk()) getTextEl().innerHTML = buildTypingHtml();
    }

    const MAX_RETRIES = CONFIG.MAX_CHAT_RETRIES;
    let lastError = null;
    try {
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = attempt * 2000;
                    showToast(`Network error, retrying (${attempt}/${MAX_RETRIES})...`, 'warning');
                    if (domOk()) {
                        getTextEl().innerHTML = buildTypingHtml(`Retrying (${attempt}/${MAX_RETRIES})...`);
                    }
                    await new Promise(r => setTimeout(r, delay));
                }
                await sendChatStream(buildMsgs(), onStreamEvent, searchContext);
                lastError = null;
                break;
            } catch (err) {
                if (err.name === 'AbortError') {
                    assistantMsg.text = messageText || '*(generation stopped)*';
                    if (domOk()) getTextEl().innerHTML = renderMarkdown(assistantMsg.text);
                    lastError = null;
                    break;
                }
                lastError = err;
                if (messageText) break;
            }
        }
        if (lastError) {
            assistantMsg.text = messageText || `*Error: ${lastError.message}*`;
            if (domOk()) getTextEl().innerHTML = renderMarkdown(assistantMsg.text);
            showToast(`Error: ${lastError.message}`, 'error');
        }
    } finally {
        const genConvId = state.generatingConvId;
        state.isGenerating = false;
        state.generatingConvId = null;
        state.abortController = null;
        DOM.btnSend.classList.remove('hidden');
        DOM.btnStop.classList.add('hidden');
        saveConversations();

        if (state.currentConversationId === genConvId && !assistantDiv.isConnected) {
            renderChat();
        }

        updateSendButton();
        scrollToBottom();
        updateQueueBadge();

        // Process next queued message
        if (state.messageQueue.length > 0) {
            const next = state.messageQueue.shift();

            const queuedEl = DOM.messagesContainer.querySelector('.message.queued');
            if (queuedEl) {
                queuedEl.remove();
            }

            const genConv = state.conversations.find(c => c.id === genConvId);
            if (genConv) {
                const idx = genConv.messages.findIndex(m => m.queued && m.text === next.text);
                if (idx !== -1) genConv.messages.splice(idx, 1);
            }

            DOM.messageInput.value = next.text;
            state.pendingImages = next.images.map(url => ({ dataUrl: url, name: 'queued' }));
            renderImagePreviews();

            updateQueueBadge();
            sendMessage();
        }
    }
}

export function stopGeneration() {
    if (state.abortController) {
        state.abortController.abort();
    }
}
