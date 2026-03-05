// ===== UI Rendering & Helpers =====

import { DOM } from './dom.js';
import state from './state.js';
import { escapeHtml, showToast } from './utils.js';
import { renderMarkdown } from './markdown.js';

// ===== HTML Builders =====

export function buildStatsHtml(stats, msgId = null) {
    if (!stats && !msgId) return '';
    const statsPart = stats ? `
    <span>⚡ ${stats.tokens_per_second?.toFixed(1) || '?'} t/s</span>
    <span>📝 ${stats.total_output_tokens || '?'} tokens</span>
    <span>⏱️ ${stats.time_to_first_token_seconds?.toFixed(2) || '?'}s TTFT</span>` : '';

    const copyBtn = msgId ? `<button class="btn-copy-msg" onclick="window.copyMessage('${msgId}', this)" title="Copy Response">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
    </button>` : '';

    return `<div class="message-stats">
        <div class="stats-data">${statsPart}</div>
        ${copyBtn}
    </div>`;
}

export function buildTypingHtml(label) {
    return `<div class="typing-indicator"><span></span><span></span><span></span></div>${label ? `<span style="font-size:0.75rem;color:var(--text-muted);margin-left:8px">${label}</span>` : ''}`;
}

export function buildReasoningHtml(reasoningText, isStreaming = false) {
    const collapsedClass = isStreaming ? '' : ' collapsed';
    return `<div class="reasoning-block">
    <div class="reasoning-header${collapsedClass}" onclick="this.classList.toggle('collapsed'); this.nextElementSibling.classList.toggle('collapsed')">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      Reasoning
    </div>
    <div class="reasoning-wrapper${collapsedClass}">
      <div class="reasoning-wrapper-inner">
        <div class="reasoning-content">${renderMarkdown(reasoningText)}</div>
      </div>
    </div>
  </div>`;
}

// ===== Scroll =====

let _scrollRafId = null;
export function scrollToBottom() {
    if (_scrollRafId) return;
    _scrollRafId = requestAnimationFrame(() => {
        DOM.chatArea.scrollTop = DOM.chatArea.scrollHeight;
        _scrollRafId = null;
    });
}

// ===== Lightbox =====

window.__openLightbox = function (src) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<img src="${src}" alt="Imagen">`;
    lb.addEventListener('click', () => lb.remove());
    document.body.appendChild(lb);
};

window.copyMessage = function (id, btn) {
    const conv = state.conversations.find(c => c.id === state.currentConversationId);
    if (!conv) return;
    const msg = conv.messages.find(m => m.id === id);
    if (!msg || !msg.text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(msg.text).then(() => {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '✓';
            setTimeout(() => btn.innerHTML = originalHtml, 2000);
        });
    } else {
        const ta = document.createElement('textarea');
        ta.value = msg.text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '✓';
        setTimeout(() => btn.innerHTML = originalHtml, 2000);
    }
};

// ===== Message Rendering =====

export function appendMessageToDOM(msg) {
    const div = document.createElement('div');
    div.className = `message ${msg.role}`;
    div.dataset.id = msg.id;

    const avatarLabel = msg.role === 'user' ? '👤' : '✨';

    let imagesHtml = '';
    if (msg.images && msg.images.length > 0) {
        imagesHtml = `<div class="message-images">${msg.images.map(src =>
            `<img src="${src}" alt="Imagen adjunta" onclick="window.__openLightbox('${src}')">`
        ).join('')}</div>`;
    }

    let reasoningHtml = '';
    if (msg.reasoning) {
        reasoningHtml = buildReasoningHtml(msg.reasoning);
    }

    let contentHtml = '';
    if (msg.role === 'user') {
        contentHtml = escapeHtml(msg.text).replace(/\n/g, '<br>');
    } else {
        contentHtml = renderMarkdown(msg.text || '');
    }

    let statsHtml = '';
    if (msg.role === 'assistant') {
        statsHtml = buildStatsHtml(msg.stats, msg.id);
    }

    div.innerHTML = `
    <div class="message-avatar">${avatarLabel}</div>
    <div class="message-content">
      ${imagesHtml}
      ${reasoningHtml}
      <div class="message-text">${contentHtml}</div>
      ${statsHtml}
    </div>
  `;

    DOM.messagesContainer.appendChild(div);
    return div;
}

// ===== Model Badge & Picker =====

export function getActiveModel() {
    const conv = state.conversations.find(c => c.id === state.currentConversationId);
    return conv?.model || state.settings.model || '';
}

export function updateModelBadge() {
    const activeModel = getActiveModel();
    if (activeModel) {
        const model = state.models.find(m => m.key === activeModel);
        DOM.modelBadgeText.textContent = model?.display_name || activeModel;
    } else {
        DOM.modelBadgeText.textContent = 'No model';
    }
}

export function toggleModelPicker() {
    const isHidden = DOM.modelPicker.classList.contains('hidden');
    if (isHidden) {
        renderModelPicker();
        DOM.modelPicker.classList.remove('hidden');
        DOM.modelBadge.classList.add('open');
    } else {
        DOM.modelPicker.classList.add('hidden');
        DOM.modelBadge.classList.remove('open');
    }
}

export function closeModelPicker() {
    DOM.modelPicker.classList.add('hidden');
    DOM.modelBadge.classList.remove('open');
}

function renderModelPicker() {
    const activeModel = getActiveModel();
    const llms = state.models.filter(m => m.type === 'llm');
    if (llms.length === 0) {
        DOM.modelPickerList.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:0.82rem;text-align:center">No models available</div>';
        return;
    }
    DOM.modelPickerList.innerHTML = llms.map(m => {
        const loaded = m.loaded_instances?.length > 0 ? '● ' : '';
        const vision = m.capabilities?.vision ? ' 👁️' : '';
        const isActive = m.key === activeModel;
        return `<div class="model-picker-item${isActive ? ' active' : ''}" data-key="${escapeHtml(m.key)}">
      <span class="picker-model-name">${loaded}${escapeHtml(m.display_name)}${vision}</span>
      <span class="picker-model-info">${m.params_string || ''}</span>
    </div>`;
    }).join('');
}

export async function selectModelForChat(modelKey) {
    let conv = state.conversations.find(c => c.id === state.currentConversationId);
    if (!conv) {
        const { createConversation } = await import('./conversations.js');
        conv = createConversation();
    }
    conv.model = modelKey;
    const { saveConversations } = await import('./storage.js');
    saveConversations();
    updateModelBadge();
    closeModelPicker();
    showToast(`Model for this chat: ${modelKey}`, 'success');
}

// ===== Send Button =====

export function updateSendButton() {
    const hasText = DOM.messageInput.value.trim().length > 0;
    const hasImages = state.pendingImages.length > 0;
    DOM.btnSend.disabled = !hasText && !hasImages;
}

// ===== Queue Badge =====

export function updateQueueBadge() {
    let badge = DOM.btnStop.querySelector('.queue-count');
    if (state.messageQueue.length > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'queue-count';
            DOM.btnStop.appendChild(badge);
        }
        badge.textContent = state.messageQueue.length;
    } else {
        if (badge) badge.remove();
    }
}

// ===== Sidebar =====

export function openSidebar() {
    DOM.sidebar.classList.add('active');
    DOM.sidebarOverlay.classList.add('active');
}

export function closeSidebar() {
    DOM.sidebar.classList.remove('active');
    DOM.sidebarOverlay.classList.remove('active');
}

// ===== Input Handling =====

export function autoResize() {
    DOM.messageInput.style.height = 'auto';
    DOM.messageInput.style.height = Math.min(DOM.messageInput.scrollHeight, 180) + 'px';
}

// ===== Web Search UI =====

import { saveSettings } from './storage.js';

export function buildSearchSourcesHtml(sources) {
    if (!sources || sources.length === 0) return '';
    const items = sources.map(s =>
        `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" class="search-source-link" title="${escapeHtml(s.title)}">
            <span class="source-index">[${s.index}]</span>
            <span class="source-title">${escapeHtml(s.title)}</span>
        </a>`
    ).join('');
    return `<div class="search-sources">
        <div class="search-sources-header">🌐 Sources</div>
        <div class="search-sources-list">${items}</div>
    </div>`;
}

export function updateSearchButton() {
    if (state.settings.searchEnabled) {
        DOM.btnSearch.classList.add('active');
        DOM.btnSearch.title = 'Web search ON — click to disable';
    } else {
        DOM.btnSearch.classList.remove('active');
        DOM.btnSearch.title = 'Web search OFF — click to enable';
    }
}

export function toggleSearch() {
    state.settings.searchEnabled = !state.settings.searchEnabled;
    saveSettings();
    updateSearchButton();
    showToast(
        state.settings.searchEnabled ? '🌐 Web search enabled' : '🌐 Web search disabled',
        state.settings.searchEnabled ? 'success' : 'info'
    );
}
