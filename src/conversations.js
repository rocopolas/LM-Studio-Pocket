// ===== Conversation Management =====

import state from './state.js';
import { DOM } from './dom.js';
import { generateId, escapeHtml, formatTime } from './utils.js';
import { saveConversations } from './storage.js';
import { appendMessageToDOM, scrollToBottom, updateModelBadge, closeSidebar, updateQueueBadge, updateSendButton } from './ui.js';
import { renderMarkdown } from './markdown.js';
import { stopGeneration, tryReconnectStream } from './chat.js';

export function createConversation() {
    const conv = {
        id: generateId(),
        title: 'New Conversation',
        model: state.settings.model || '',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    state.conversations.unshift(conv);
    state.currentConversationId = conv.id;
    saveConversations();
    renderConversationsList();
    renderChat();
    return conv;
}

export function getCurrentConversation() {
    return state.conversations.find(c => c.id === state.currentConversationId);
}

export function switchConversation(id) {
    stopGeneration(); // Force-stop any ongoing chat streams

    // Clear queues so messages don't leak into the new tab
    state.messageQueue = [];
    state.pendingImages = [];
    updateQueueBadge();
    updateSendButton();

    state.currentConversationId = id;
    renderConversationsList();
    renderChat();
    closeSidebar();
}

export function deleteConversation(id) {
    state.conversations = state.conversations.filter(c => c.id !== id);
    if (state.currentConversationId === id) {
        state.currentConversationId = state.conversations[0]?.id || null;
        switchConversation(state.currentConversationId);
    } else {
        saveConversations();
        renderConversationsList();
    }
}

export function updateConversationTitle(conv) {
    if (conv.messages.length === 1 && conv.title === 'New Conversation') {
        const firstMsg = conv.messages[0].text || '';
        conv.title = firstMsg.slice(0, 50) + (firstMsg.length > 50 ? '…' : '') || 'Chat';
        conv.updatedAt = Date.now();
        saveConversations();
        renderConversationsList();
    } else {
        conv.updatedAt = Date.now();
    }
}

export function renderConversationsList() {
    DOM.conversationsList.innerHTML = '';
    for (const conv of state.conversations) {
        const div = document.createElement('div');
        div.className = `conversation-item${conv.id === state.currentConversationId ? ' active' : ''}`;
        div.innerHTML = `
      <div class="conv-icon">💬</div>
      <div class="conv-info">
        <div class="conv-title">${escapeHtml(conv.title)}</div>
        <div class="conv-time">${formatTime(conv.updatedAt)}</div>
      </div>
      <button class="btn-icon conv-delete" title="Eliminar" data-id="${conv.id}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
        div.addEventListener('click', (e) => {
            if (e.target.closest('.conv-delete')) {
                e.stopPropagation();
                deleteConversation(conv.id);
                return;
            }
            switchConversation(conv.id);
        });
        DOM.conversationsList.appendChild(div);
    }
}

export function renderChat() {
    const conv = getCurrentConversation();
    DOM.messagesContainer.innerHTML = '';

    if (!conv || conv.messages.length === 0) {
        DOM.welcomeScreen.classList.remove('hidden');
        DOM.chatTitle.textContent = 'New Conversation';
    } else {
        DOM.welcomeScreen.classList.add('hidden');
        DOM.chatTitle.textContent = conv.title;
        for (const msg of conv.messages) {
            appendMessageToDOM(msg);
        }
        scrollToBottom();
    }

    updateModelBadge();
    tryReconnectStream(conv);
}
