// ===== LM Studio Pocket Application =====
// Connects to LM Studio v1 REST API

(() => {
  'use strict';

  // ===== State =====
  const state = {
    conversations: [],
    currentConversationId: null,
    settings: {
      serverUrl: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SERVER_URL) || 'http://localhost:1234',
      apiKey: '',
      model: '',
      systemPrompt: '',
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      minP: 0.05,
      repeatPenalty: 1.1,
      maxTokens: 2048,
      contextLength: 4096,
      memoryEnabled: true,
      memory: '',
    },
    models: [],
    pendingImages: [], // { dataUrl, name }
    isGenerating: false,
    abortController: null,
  };

  // ===== DOM References =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const DOM = {
    sidebarOverlay: $('#sidebar-overlay'),
    sidebar: $('#sidebar'),
    btnMenu: $('#btn-menu'),
    btnNewChat: $('#btn-new-chat'),
    conversationsList: $('#conversations-list'),
    btnSettings: $('#btn-settings'),
    chatTitle: $('#chat-title'),
    modelBadge: $('#model-badge'),
    btnClearChat: $('#btn-clear-chat'),
    chatArea: $('#chat-area'),
    welcomeScreen: $('#welcome-screen'),
    messagesContainer: $('#messages-container'),
    imagePreviewBar: $('#image-preview-bar'),
    imagePreviews: $('#image-previews'),
    messageInput: $('#message-input'),
    btnAttach: $('#btn-attach'),
    btnSend: $('#btn-send'),
    btnStop: $('#btn-stop'),
    fileInput: $('#file-input'),
    settingsOverlay: $('#settings-overlay'),
    settingsPanel: $('#settings-panel'),
    btnCloseSettings: $('#btn-close-settings'),
    btnSaveSettings: $('#btn-save-settings'),
    btnTestConnection: $('#btn-test-connection'),
    connectionStatus: $('#connection-status'),
    btnRefreshModels: $('#btn-refresh-models'),
    btnToggleKey: $('#btn-toggle-key'),
    settingServerUrl: $('#setting-server-url'),
    settingApiKey: $('#setting-api-key'),
    settingModel: $('#setting-model'),
    settingSystemPrompt: $('#setting-system-prompt'),
    settingTemperature: $('#setting-temperature'),
    settingTopP: $('#setting-top-p'),
    settingTopK: $('#setting-top-k'),
    settingMinP: $('#setting-min-p'),
    settingRepeatPenalty: $('#setting-repeat-penalty'),
    settingMaxTokens: $('#setting-max-tokens'),
    settingContextLength: $('#setting-context-length'),
    modelInfo: $('#model-info'),
    // Memory
    settingMemoryEnabled: $('#setting-memory-enabled'),
    settingMemory: $('#setting-memory'),
    memoryTextareaGroup: $('#memory-textarea-group'),
    dropZone: $('#drop-zone'),
    toastContainer: $('#toast-container'),
    // Model picker
    modelBadgeText: $('#model-badge-text'),
    modelPicker: $('#model-picker'),
    modelPickerList: $('#model-picker-list'),
    // Models panel
    btnModels: $('#btn-models'),
    modelsOverlay: $('#models-overlay'),
    modelsPanel: $('#models-panel'),
    btnCloseModels: $('#btn-close-models'),
    btnRefreshModelsPanel: $('#btn-refresh-models-panel'),
    modelsListContainer: $('#models-list-container'),
    downloadModelId: $('#download-model-id'),
    downloadQuantization: $('#download-quantization'),
    btnDownloadModel: $('#btn-download-model'),
    downloadStatus: $('#download-status'),
  };

  // ===== Utilities =====
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Ahora';
    if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  }

  function showToast(message, type = 'info') {
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
    DOM.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ===== Markdown Rendering =====
  function renderMarkdown(text) {
    if (typeof marked === 'undefined') return escapeHtml(text).replace(/\n/g, '<br>');

    marked.setOptions({
      highlight: function (code, lang) {
        if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
          try { return hljs.highlight(code, { language: lang }).value; } catch (e) { }
        }
        if (typeof hljs !== 'undefined') {
          try { return hljs.highlightAuto(code).value; } catch (e) { }
        }
        return escapeHtml(code);
      },
      breaks: true,
      gfm: true,
    });

    const renderer = new marked.Renderer();
    const origCode = renderer.code;
    renderer.code = function (obj) {
      const code = typeof obj === 'object' ? obj.text : obj;
      const lang = typeof obj === 'object' ? obj.lang : arguments[1];
      let highlighted = code;
      if (typeof hljs !== 'undefined') {
        try {
          highlighted = lang && hljs.getLanguage(lang)
            ? hljs.highlight(code, { language: lang }).value
            : hljs.highlightAuto(code).value;
        } catch (e) {
          highlighted = escapeHtml(code);
        }
      } else {
        highlighted = escapeHtml(code);
      }
      const langLabel = lang || 'code';
      return `<pre><div class="code-header"><span>${escapeHtml(langLabel)}</span><button class="btn-copy-code" onclick="window.__copyCode(this)">📋 Copiar</button></div><code class="hljs language-${escapeHtml(langLabel)}">${highlighted}</code></pre>`;
    };

    return marked.parse(text, { renderer });
  }

  window.__copyCode = function (btn) {
    const code = btn.closest('pre').querySelector('code').textContent;
    navigator.clipboard.writeText(code).then(() => {
      btn.textContent = '✓ Copied';
      setTimeout(() => { btn.innerHTML = '📋 Copiar'; }, 2000);
    });
  };

  // ===== Storage =====
  function loadSettings() {
    try {
      const saved = localStorage.getItem('lm-studio-pocket-settings');
      if (saved) Object.assign(state.settings, JSON.parse(saved));
    } catch (e) { }
  }

  function saveSettings() {
    localStorage.setItem('lm-studio-pocket-settings', JSON.stringify(state.settings));
  }

  function loadConversations() {
    try {
      const saved = localStorage.getItem('lm-studio-pocket-conversations');
      if (saved) state.conversations = JSON.parse(saved);
    } catch (e) { }
  }

  function saveConversations() {
    localStorage.setItem('lm-studio-pocket-conversations', JSON.stringify(state.conversations));
  }

  // ===== Conversation Management =====
  function createConversation() {
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

  function getCurrentConversation() {
    return state.conversations.find(c => c.id === state.currentConversationId);
  }

  function switchConversation(id) {
    state.currentConversationId = id;
    renderConversationsList();
    renderChat();
    closeSidebar();
  }

  function deleteConversation(id) {
    state.conversations = state.conversations.filter(c => c.id !== id);
    if (state.currentConversationId === id) {
      state.currentConversationId = state.conversations[0]?.id || null;
    }
    saveConversations();
    renderConversationsList();
    renderChat();
  }

  function updateConversationTitle(conv) {
    if (conv.messages.length === 1 && conv.title === 'New Conversation') {
      const firstMsg = conv.messages[0].text || '';
      conv.title = firstMsg.slice(0, 50) + (firstMsg.length > 50 ? '…' : '') || 'Chat';
    }
    conv.updatedAt = Date.now();
    saveConversations();
    renderConversationsList();
  }

  // ===== API Client =====
  function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (state.settings.apiKey) {
      headers['Authorization'] = `Bearer ${state.settings.apiKey}`;
    }
    return headers;
  }

  async function fetchModels() {
    const url = `${state.settings.serverUrl}/api/v1/models`;
    const resp = await fetch(url, { headers: getHeaders() });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data.models || [];
  }

  async function sendChatStream(messages, onEvent) {
    const conv = getCurrentConversation();
    const input = [];

    // Build input array from message history
    for (const msg of messages) {
      if (msg.role === 'user') {
        // Add images if any
        if (msg.images && msg.images.length > 0) {
          for (const img of msg.images) {
            input.push({ type: 'image', data_url: img });
          }
        }
        input.push({ type: 'text', content: msg.text });
      }
    }

    // For assistant messages, we use previous_response_id if available
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

    // Build system prompt with memory
    let systemPrompt = '';
    if (state.settings.memoryEnabled && state.settings.memory.trim()) {
      systemPrompt += `[User Memory]\n${state.settings.memory.trim()}\n[/User Memory]\n\n`;
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
      // When using previous_response_id, only send the latest user message
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
          } catch (e) { }
          currentEvent = null;
        }
      }
    }
  }

  // ===== UI Rendering =====
  function renderConversationsList() {
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

  function renderChat() {
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
  }

  function appendMessageToDOM(msg) {
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
      reasoningHtml = `
        <div class="reasoning-block">
          <div class="reasoning-header" onclick="this.classList.toggle('collapsed');this.nextElementSibling.classList.toggle('collapsed')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            Razonamiento
          </div>
          <div class="reasoning-content">${renderMarkdown(msg.reasoning)}</div>
        </div>
      `;
    }

    let contentHtml = '';
    if (msg.role === 'user') {
      contentHtml = escapeHtml(msg.text).replace(/\n/g, '<br>');
    } else {
      contentHtml = renderMarkdown(msg.text || '');
    }

    let statsHtml = '';
    if (msg.stats) {
      const s = msg.stats;
      statsHtml = `
        <div class="message-stats">
          <span>⚡ ${s.tokens_per_second?.toFixed(1) || '?'} t/s</span>
          <span>📝 ${s.total_output_tokens || '?'} tokens</span>
          <span>⏱️ ${s.time_to_first_token_seconds?.toFixed(2) || '?'}s TTFT</span>
        </div>
      `;
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

  function getActiveModel() {
    const conv = getCurrentConversation();
    return conv?.model || state.settings.model || '';
  }

  function updateModelBadge() {
    const activeModel = getActiveModel();
    if (activeModel) {
      const model = state.models.find(m => m.key === activeModel);
      DOM.modelBadgeText.textContent = model?.display_name || activeModel;
    } else {
      DOM.modelBadgeText.textContent = 'No model';
    }
  }

  function toggleModelPicker() {
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

  function closeModelPicker() {
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

  function selectModelForChat(modelKey) {
    let conv = getCurrentConversation();
    if (!conv) {
      conv = createConversation();
    }
    conv.model = modelKey;
    saveConversations();
    updateModelBadge();
    closeModelPicker();
    showToast(`Model for this chat: ${modelKey}`, 'success');
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      DOM.chatArea.scrollTop = DOM.chatArea.scrollHeight;
    });
  }

  window.__openLightbox = function (src) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<img src="${src}" alt="Imagen">`;
    lb.addEventListener('click', () => lb.remove());
    document.body.appendChild(lb);
  };

  // ===== Image Handling =====
  function compressImage(dataUrl, maxDim, callback) {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => callback(dataUrl); // Fallback si falla
    img.src = dataUrl;
  }

  function addImage(file) {
    if (!file.type.startsWith('image/')) {
      showToast('Only images are allowed', 'warning');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showToast('Image is too large (max 20MB)', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      compressImage(e.target.result, 1200, (compressedDataUrl) => {
        state.pendingImages.push({ dataUrl: compressedDataUrl, name: file.name });
        renderImagePreviews();
      });
    };
    reader.readAsDataURL(file);
  }

  function addImageFromDataUrl(dataUrl) {
    compressImage(dataUrl, 1200, (compressedDataUrl) => {
      state.pendingImages.push({ dataUrl: compressedDataUrl, name: 'clipboard' });
      renderImagePreviews();
    });
  }

  function removeImage(index) {
    state.pendingImages.splice(index, 1);
    renderImagePreviews();
  }

  function renderImagePreviews() {
    if (state.pendingImages.length === 0) {
      DOM.imagePreviewBar.classList.add('hidden');
      return;
    }
    DOM.imagePreviewBar.classList.remove('hidden');
    DOM.imagePreviews.innerHTML = state.pendingImages.map((img, i) => `
      <div class="image-preview-item">
        <img src="${img.dataUrl}" alt="${escapeHtml(img.name)}">
        <button class="btn-remove-image" onclick="window.__removeImage(${i})">✕</button>
      </div>
    `).join('');
    updateSendButton();
  }

  window.__removeImage = function (i) {
    removeImage(i);
  };

  // ===== Send Message =====
  async function sendMessage() {
    const text = DOM.messageInput.value.trim();
    if (!text && state.pendingImages.length === 0) return;
    if (state.isGenerating) return;
    if (!state.settings.model && !getActiveModel()) {
      showToast('Select a model in Settings or the chat selector', 'warning');
      return;
    }

    let conv = getCurrentConversation();
    if (!conv) {
      conv = createConversation();
    }

    // Hide welcome
    DOM.welcomeScreen.classList.add('hidden');

    // Create user message
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

    // Clear input
    DOM.messageInput.value = '';
    DOM.messageInput.style.height = 'auto';
    state.pendingImages = [];
    renderImagePreviews();
    updateSendButton();

    // Update title
    updateConversationTitle(conv);

    // Create assistant placeholder
    const assistantMsg = {
      id: generateId(),
      role: 'assistant',
      text: '',
      reasoning: '',
      stats: null,
      timestamp: Date.now(),
    };
    conv.messages.push(assistantMsg);
    const assistantDiv = appendMessageToDOM(assistantMsg);
    const textEl = assistantDiv.querySelector('.message-text');

    // Show typing indicator
    textEl.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    scrollToBottom();

    // Switch buttons
    state.isGenerating = true;
    DOM.btnSend.classList.add('hidden');
    DOM.btnStop.classList.remove('hidden');

    let messageText = '';
    let reasoningText = '';
    let isReasoning = false;

    try {
      await sendChatStream(
        conv.messages.filter(m => m.role === 'user').map(m => ({
          role: 'user',
          text: m.text,
          images: m.images,
        })),
        (eventType, data) => {
          switch (eventType) {
            case 'reasoning.start':
              isReasoning = true;
              break;
            case 'reasoning.delta':
              reasoningText += data.content || '';
              break;
            case 'reasoning.end':
              isReasoning = false;
              if (reasoningText) {
                assistantMsg.reasoning = reasoningText;
                // Insert reasoning block
                const contentEl = assistantDiv.querySelector('.message-content');
                let reasoningBlock = contentEl.querySelector('.reasoning-block');
                if (!reasoningBlock) {
                  reasoningBlock = document.createElement('div');
                  reasoningBlock.className = 'reasoning-block';
                  reasoningBlock.innerHTML = `
                    <div class="reasoning-header collapsed" onclick="this.classList.toggle('collapsed');this.nextElementSibling.classList.toggle('collapsed')">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                      Razonamiento
                    </div>
                    <div class="reasoning-content collapsed">${renderMarkdown(reasoningText)}</div>
                  `;
                  contentEl.insertBefore(reasoningBlock, textEl);
                }
              }
              break;
            case 'message.start':
              textEl.innerHTML = '';
              break;
            case 'message.delta':
              messageText += data.content || '';
              textEl.innerHTML = renderMarkdown(messageText);
              scrollToBottom();
              break;
            case 'message.end':
              assistantMsg.text = messageText;
              break;
            case 'chat.end':
              if (data.result) {
                assistantMsg.stats = data.result.stats;
                if (data.result.response_id) {
                  conv.lastResponseId = data.result.response_id;
                }
                // Render stats
                if (assistantMsg.stats) {
                  const s = assistantMsg.stats;
                  const statsDiv = document.createElement('div');
                  statsDiv.className = 'message-stats';
                  statsDiv.innerHTML = `
                    <span>⚡ ${s.tokens_per_second?.toFixed(1) || '?'} t/s</span>
                    <span>📝 ${s.total_output_tokens || '?'} tokens</span>
                    <span>⏱️ ${s.time_to_first_token_seconds?.toFixed(2) || '?'}s TTFT</span>
                  `;
                  assistantDiv.querySelector('.message-content').appendChild(statsDiv);
                }
              }
              break;
            case 'error':
              const errMsg = data.error?.message || 'Error desconocido';
              showToast(errMsg, 'error');
              break;
            case 'prompt_processing.start':
              textEl.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div><span style="font-size:0.75rem;color:var(--text-muted);margin-left:8px">Processing prompt...</span>';
              break;
            case 'model_load.start':
              textEl.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div><span style="font-size:0.75rem;color:var(--text-muted);margin-left:8px">Loading model...</span>';
              break;
            case 'model_load.progress':
              const pct = data.progress != null ? `${Math.round(data.progress * 100)}%` : '';
              textEl.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div><span style="font-size:0.75rem;color:var(--text-muted);margin-left:8px">Loading model... ${pct}</span>`;
              break;
          }
        }
      );
    } catch (e) {
      if (e.name === 'AbortError') {
        assistantMsg.text = messageText || '*(generación detenida)*';
        textEl.innerHTML = renderMarkdown(assistantMsg.text);
      } else {
        assistantMsg.text = `*Error: ${e.message}*`;
        textEl.innerHTML = renderMarkdown(assistantMsg.text);
        showToast(`Error: ${e.message}`, 'error');
      }
    } finally {
      state.isGenerating = false;
      state.abortController = null;
      DOM.btnSend.classList.remove('hidden');
      DOM.btnStop.classList.add('hidden');
      saveConversations();
      updateSendButton();
      scrollToBottom();
    }
  }

  function stopGeneration() {
    if (state.abortController) {
      state.abortController.abort();
    }
  }

  // ===== Settings UI =====
  function openSettings() {
    populateSettingsForm();
    DOM.settingsPanel.classList.add('active');
    DOM.settingsOverlay.classList.add('active');
  }

  function closeSettings() {
    DOM.settingsPanel.classList.remove('active');
    DOM.settingsOverlay.classList.remove('active');
  }

  function populateSettingsForm() {
    DOM.settingServerUrl.value = state.settings.serverUrl;
    DOM.settingApiKey.value = state.settings.apiKey;
    DOM.settingSystemPrompt.value = state.settings.systemPrompt;
    DOM.settingTemperature.value = state.settings.temperature;
    DOM.settingTopP.value = state.settings.topP;
    DOM.settingTopK.value = state.settings.topK;
    DOM.settingMinP.value = state.settings.minP;
    DOM.settingRepeatPenalty.value = state.settings.repeatPenalty;
    DOM.settingMaxTokens.value = state.settings.maxTokens;
    DOM.settingContextLength.value = state.settings.contextLength;
    DOM.settingMemoryEnabled.checked = state.settings.memoryEnabled;
    DOM.settingMemory.value = state.settings.memory;
    DOM.memoryTextareaGroup.style.display = state.settings.memoryEnabled ? '' : 'none';
    updateParamLabels();
    populateModelSelect();
  }

  function saveSettingsFromForm() {
    state.settings.serverUrl = DOM.settingServerUrl.value.replace(/\/+$/, '');
    state.settings.apiKey = DOM.settingApiKey.value;
    state.settings.model = DOM.settingModel.value;
    state.settings.systemPrompt = DOM.settingSystemPrompt.value;
    state.settings.temperature = parseFloat(DOM.settingTemperature.value);
    state.settings.topP = parseFloat(DOM.settingTopP.value);
    state.settings.topK = parseInt(DOM.settingTopK.value);
    state.settings.minP = parseFloat(DOM.settingMinP.value);
    state.settings.repeatPenalty = parseFloat(DOM.settingRepeatPenalty.value);
    state.settings.maxTokens = parseInt(DOM.settingMaxTokens.value);
    state.settings.contextLength = parseInt(DOM.settingContextLength.value);
    state.settings.memoryEnabled = DOM.settingMemoryEnabled.checked;
    state.settings.memory = DOM.settingMemory.value;
    saveSettings();
    updateModelBadge();
    showToast('Settings saved', 'success');
    closeSettings();
  }

  function updateParamLabels() {
    $('#temperature-value').textContent = parseFloat(DOM.settingTemperature.value).toFixed(2);
    $('#top-p-value').textContent = parseFloat(DOM.settingTopP.value).toFixed(2);
    $('#top-k-value').textContent = DOM.settingTopK.value;
    $('#min-p-value').textContent = parseFloat(DOM.settingMinP.value).toFixed(2);
    $('#repeat-penalty-value').textContent = parseFloat(DOM.settingRepeatPenalty.value).toFixed(2);
    $('#max-tokens-value').textContent = DOM.settingMaxTokens.value;
    $('#context-length-value').textContent = DOM.settingContextLength.value;
  }

  function populateModelSelect() {
    const select = DOM.settingModel;
    select.innerHTML = '';
    if (state.models.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '— Load models first —';
      select.appendChild(opt);
    } else {
      for (const m of state.models.filter(m => m.type === 'llm')) {
        const opt = document.createElement('option');
        opt.value = m.key;
        const loaded = m.loaded_instances?.length > 0 ? ' ● Cargado' : '';
        const vision = m.capabilities?.vision ? ' 👁️' : '';
        opt.textContent = `${m.display_name} (${m.params_string || '?'})${vision}${loaded}`;
        if (m.key === state.settings.model) opt.selected = true;
        select.appendChild(opt);
      }
    }
  }

  async function refreshModels() {
    DOM.btnRefreshModels.querySelector('svg').style.animation = 'spin 0.6s linear infinite';
    DOM.modelInfo.innerHTML = '<div class="spinner"></div>';
    try {
      state.models = await fetchModels();
      populateModelSelect();
      // Auto-select first loaded model if none selected
      if (!state.settings.model) {
        const loaded = state.models.find(m => m.type === 'llm' && m.loaded_instances?.length > 0);
        if (loaded) {
          state.settings.model = loaded.key;
          DOM.settingModel.value = loaded.key;
        }
      }
      showModelInfo();
      showToast(`${state.models.filter(m => m.type === 'llm').length} models found`, 'success');
    } catch (e) {
      showToast(`Error loading models: ${e.message}`, 'error');
      DOM.modelInfo.innerHTML = '';
    } finally {
      DOM.btnRefreshModels.querySelector('svg').style.animation = '';
    }
  }

  function showModelInfo() {
    const key = DOM.settingModel.value;
    const model = state.models.find(m => m.key === key);
    if (!model) {
      DOM.modelInfo.innerHTML = '';
      return;
    }
    const tags = [];
    if (model.architecture) tags.push(`<span class="info-tag">${model.architecture}</span>`);
    if (model.quantization?.name) tags.push(`<span class="info-tag">${model.quantization.name}</span>`);
    if (model.capabilities?.vision) tags.push(`<span class="info-tag vision">👁️ Visión</span>`);
    if (model.capabilities?.trained_for_tool_use) tags.push(`<span class="info-tag">🔧 Tools</span>`);
    if (model.loaded_instances?.length > 0) tags.push(`<span class="info-tag" style="color:var(--success)">● Cargado</span>`);
    const sizeMB = (model.size_bytes / (1024 * 1024)).toFixed(0);
    tags.push(`<span class="info-tag">${sizeMB} MB</span>`);
    tags.push(`<span class="info-tag">ctx ${model.max_context_length}</span>`);
    DOM.modelInfo.innerHTML = tags.join('');
  }

  async function testConnection() {
    DOM.connectionStatus.className = 'connection-status';
    DOM.connectionStatus.style.display = 'none';
    DOM.btnTestConnection.disabled = true;
    DOM.btnTestConnection.innerHTML = '<div class="spinner"></div> Probando...';

    try {
      const url = DOM.settingServerUrl.value.replace(/\/+$/, '');
      const headers = {};
      if (DOM.settingApiKey.value) {
        headers['Authorization'] = `Bearer ${DOM.settingApiKey.value}`;
      }
      const resp = await fetch(`${url}/api/v1/models`, { headers });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const count = data.models?.filter(m => m.type === 'llm').length || 0;
      DOM.connectionStatus.className = 'connection-status success';
      DOM.connectionStatus.textContent = `✓ Connected — ${count} LLM models available`;
      // Also update models
      state.models = data.models || [];
      populateModelSelect();
    } catch (e) {
      DOM.connectionStatus.className = 'connection-status error';
      DOM.connectionStatus.textContent = `✕ Error: ${e.message}`;
    } finally {
      DOM.btnTestConnection.disabled = false;
      DOM.btnTestConnection.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        Probar Conexión
      `;
    }
  }

  // ===== Models Management =====
  function openModelsPanel() {
    DOM.modelsPanel.classList.add('active');
    DOM.modelsOverlay.classList.add('active');
    refreshModelsPanel();
  }

  function closeModelsPanel() {
    DOM.modelsPanel.classList.remove('active');
    DOM.modelsOverlay.classList.remove('active');
  }

  async function refreshModelsPanel() {
    const btn = DOM.btnRefreshModelsPanel;
    btn.querySelector('svg').style.animation = 'spin 0.6s linear infinite';
    DOM.modelsListContainer.innerHTML = '<div class="models-list-empty"><div class="spinner"></div></div>';
    try {
      state.models = await fetchModels();
      renderModelsList();
      populateModelSelect();
      updateModelBadge();
    } catch (e) {
      DOM.modelsListContainer.innerHTML = `<div class="models-list-empty">Error: ${escapeHtml(e.message)}</div>`;
    } finally {
      btn.querySelector('svg').style.animation = '';
    }
  }

  function renderModelsList() {
    const llms = state.models.filter(m => m.type === 'llm');
    const embeddings = state.models.filter(m => m.type === 'embedding');
    if (llms.length === 0 && embeddings.length === 0) {
      DOM.modelsListContainer.innerHTML = '<div class="models-list-empty">No models found</div>';
      return;
    }
    DOM.modelsListContainer.innerHTML = '';
    // LLMs first
    for (const m of llms) {
      DOM.modelsListContainer.appendChild(createModelCard(m));
    }
    // Then embeddings
    for (const m of embeddings) {
      DOM.modelsListContainer.appendChild(createModelCard(m));
    }
  }

  function createModelCard(m) {
    const isLoaded = m.loaded_instances && m.loaded_instances.length > 0;
    const isSelected = m.key === state.settings.model;
    const sizeMB = (m.size_bytes / (1024 * 1024)).toFixed(0);

    const card = document.createElement('div');
    card.className = `model-card${isLoaded ? ' loaded' : ''}`;

    // Tags
    const tags = [];
    if (m.type === 'llm') tags.push(`<span class="model-card-tag">LLM</span>`);
    else tags.push(`<span class="model-card-tag">Embedding</span>`);
    if (m.architecture) tags.push(`<span class="model-card-tag">${escapeHtml(m.architecture)}</span>`);
    if (m.quantization?.name) tags.push(`<span class="model-card-tag">${escapeHtml(m.quantization.name)}</span>`);
    if (m.params_string) tags.push(`<span class="model-card-tag">${escapeHtml(m.params_string)}</span>`);
    tags.push(`<span class="model-card-tag">${sizeMB} MB</span>`);
    tags.push(`<span class="model-card-tag">ctx ${m.max_context_length}</span>`);
    if (m.capabilities?.vision) tags.push(`<span class="model-card-tag vision">👁️ Visión</span>`);
    if (m.capabilities?.trained_for_tool_use) tags.push(`<span class="model-card-tag tools">🔧 Tools</span>`);
    if (m.format) tags.push(`<span class="model-card-tag">${escapeHtml(m.format)}</span>`);

    // Actions
    let actionsHtml = '';
    if (m.type === 'llm') {
      if (isLoaded) {
        actionsHtml += `<button class="btn-unload" data-instance="${escapeHtml(m.loaded_instances[0].id)}">⏏ Unload</button>`;
        if (!isSelected) {
          actionsHtml += `<button class="btn-select-model" data-key="${escapeHtml(m.key)}">✓ Usar</button>`;
        } else {
          actionsHtml += `<button class="btn-select-model" disabled style="opacity:0.5">✓ In use</button>`;
        }
      } else {
        actionsHtml += `<button class="btn-load" data-key="${escapeHtml(m.key)}">▶ Load</button>`;
      }
    } else {
      if (isLoaded) {
        actionsHtml += `<button class="btn-unload" data-instance="${escapeHtml(m.loaded_instances[0].id)}">⏏ Unload</button>`;
      } else {
        actionsHtml += `<button class="btn-load" data-key="${escapeHtml(m.key)}">▶ Load</button>`;
      }
    }

    card.innerHTML = `
      <div class="model-card-header">
        <div>
          <div class="model-card-name">${escapeHtml(m.display_name)}</div>
          <div class="model-card-publisher">${escapeHtml(m.publisher)} / ${escapeHtml(m.key)}</div>
        </div>
        <span class="model-card-status ${isLoaded ? 'loaded' : 'unloaded'}">
          ${isLoaded ? '● Cargado' : '○ Descargado'}
        </span>
      </div>
      <div class="model-card-tags">${tags.join('')}</div>
      <div class="model-card-actions">${actionsHtml}</div>
    `;

    // Event delegation for buttons
    card.addEventListener('click', async (e) => {
      const loadBtn = e.target.closest('.btn-load');
      const unloadBtn = e.target.closest('.btn-unload');
      const selectBtn = e.target.closest('.btn-select-model');

      if (loadBtn) {
        const key = loadBtn.dataset.key;
        loadBtn.disabled = true;
        loadBtn.innerHTML = '<div class="spinner"></div> Loading...';
        try {
          await loadModel(key);
          showToast(`Model ${key} loaded`, 'success');
          await refreshModelsPanel();
        } catch (err) {
          showToast(`Error: ${err.message}`, 'error');
          loadBtn.disabled = false;
          loadBtn.innerHTML = '▶ Load';
        }
      }

      if (unloadBtn) {
        const instanceId = unloadBtn.dataset.instance;
        unloadBtn.disabled = true;
        unloadBtn.innerHTML = '<div class="spinner"></div>';
        try {
          await unloadModel(instanceId);
          showToast(`Model unloaded from memory`, 'success');
          await refreshModelsPanel();
        } catch (err) {
          showToast(`Error: ${err.message}`, 'error');
          unloadBtn.disabled = false;
          unloadBtn.innerHTML = '⏏ Unload';
        }
      }

      if (selectBtn && !selectBtn.disabled) {
        const key = selectBtn.dataset.key;
        state.settings.model = key;
        saveSettings();
        updateModelBadge();
        populateModelSelect();
        renderModelsList();
        showToast(`Active model: ${key}`, 'success');
      }
    });

    return card;
  }

  async function loadModel(modelKey) {
    const resp = await fetch(`${state.settings.serverUrl}/api/v1/models/load`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        model: modelKey,
        context_length: state.settings.contextLength,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${text}`);
    }
    return resp.json();
  }

  async function unloadModel(instanceId) {
    const resp = await fetch(`${state.settings.serverUrl}/api/v1/models/unload`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ instance_id: instanceId }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${text}`);
    }
    return resp.json();
  }

  async function downloadModel() {
    const modelId = DOM.downloadModelId.value.trim();
    if (!modelId) {
      showToast('Enter a model ID', 'warning');
      return;
    }

    const body = { model: modelId };
    const quant = DOM.downloadQuantization.value.trim();
    if (quant) body.quantization = quant;

    DOM.btnDownloadModel.disabled = true;
    DOM.btnDownloadModel.innerHTML = '<div class="spinner"></div> Iniciando...';

    try {
      const resp = await fetch(`${state.settings.serverUrl}/api/v1/models/download`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${text}`);
      }
      const data = await resp.json();

      if (data.status === 'already_downloaded') {
        showToast('Model is already downloaded', 'info');
      } else {
        showToast(`Download started: ${data.status}`, 'success');
        // Show download job
        const jobHtml = `
          <div class="download-job" id="job-${data.job_id || 'unknown'}">
            <div class="download-job-header">
              <span>${escapeHtml(modelId)}</span>
              <span class="download-job-status ${data.status}">${data.status}</span>
            </div>
            ${data.total_size_bytes ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px">${(data.total_size_bytes / (1024 * 1024 * 1024)).toFixed(2)} GB</div>` : ''}
            <div class="download-progress-bar">
              <div class="download-progress-fill" style="width:${data.status === 'completed' ? '100' : '0'}%"></div>
            </div>
          </div>
        `;
        DOM.downloadStatus.innerHTML += jobHtml;

        // Poll download status if downloading
        if (data.job_id && (data.status === 'downloading' || data.status === 'paused')) {
          pollDownloadStatus(data.job_id, modelId);
        }
      }

      DOM.downloadModelId.value = '';
      DOM.downloadQuantization.value = '';
    } catch (e) {
      showToast(`Download error: ${e.message}`, 'error');
    } finally {
      DOM.btnDownloadModel.disabled = false;
      DOM.btnDownloadModel.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download
      `;
    }
  }

  async function pollDownloadStatus(jobId, modelId) {
    const jobEl = document.getElementById(`job-${jobId}`);
    if (!jobEl) return;

    try {
      const resp = await fetch(`${state.settings.serverUrl}/api/v1/models/download/status`, {
        headers: getHeaders(),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      // Find our job
      const jobs = Array.isArray(data) ? data : (data.downloads || [data]);
      const job = jobs.find(j => j.job_id === jobId);

      if (job) {
        const statusEl = jobEl.querySelector('.download-job-status');
        const fillEl = jobEl.querySelector('.download-progress-fill');
        statusEl.className = `download-job-status ${job.status}`;
        statusEl.textContent = job.status;

        if (job.progress != null) {
          fillEl.style.width = `${Math.round(job.progress * 100)}%`;
        }

        if (job.status === 'downloading' || job.status === 'paused') {
          setTimeout(() => pollDownloadStatus(jobId, modelId), 3000);
        } else if (job.status === 'completed') {
          fillEl.style.width = '100%';
          showToast(`Model ${modelId} downloaded`, 'success');
          refreshModelsPanel();
        } else if (job.status === 'failed') {
          showToast(`Download failed: ${modelId}`, 'error');
        }
      } else {
        // Job not found, might be completed
        setTimeout(() => pollDownloadStatus(jobId, modelId), 5000);
      }
    } catch (e) {
      // Retry
      setTimeout(() => pollDownloadStatus(jobId, modelId), 5000);
    }
  }

  // ===== Sidebar =====
  function openSidebar() {
    DOM.sidebar.classList.add('active');
    DOM.sidebarOverlay.classList.add('active');
  }

  function closeSidebar() {
    DOM.sidebar.classList.remove('active');
    DOM.sidebarOverlay.classList.remove('active');
  }

  // ===== Input Handling =====
  function autoResize() {
    DOM.messageInput.style.height = 'auto';
    DOM.messageInput.style.height = Math.min(DOM.messageInput.scrollHeight, 120) + 'px';
  }

  function updateSendButton() {
    const hasContent = DOM.messageInput.value.trim().length > 0 || state.pendingImages.length > 0;
    DOM.btnSend.disabled = !hasContent || state.isGenerating;
  }

  // ===== Event Listeners =====
  function initEventListeners() {
    // Sidebar
    DOM.btnMenu.addEventListener('click', openSidebar);
    DOM.sidebarOverlay.addEventListener('click', closeSidebar);
    DOM.btnNewChat.addEventListener('click', () => {
      createConversation();
      closeSidebar();
    });

    // Settings
    DOM.btnSettings.addEventListener('click', openSettings);
    DOM.btnCloseSettings.addEventListener('click', closeSettings);
    DOM.settingsOverlay.addEventListener('click', closeSettings);
    DOM.btnSaveSettings.addEventListener('click', saveSettingsFromForm);
    DOM.btnTestConnection.addEventListener('click', testConnection);
    DOM.btnRefreshModels.addEventListener('click', refreshModels);
    DOM.settingModel.addEventListener('change', showModelInfo);

    // Models panel
    DOM.btnModels.addEventListener('click', openModelsPanel);
    DOM.btnCloseModels.addEventListener('click', closeModelsPanel);
    DOM.modelsOverlay.addEventListener('click', closeModelsPanel);
    DOM.btnRefreshModelsPanel.addEventListener('click', refreshModelsPanel);
    DOM.btnDownloadModel.addEventListener('click', downloadModel);

    // Model picker (per-chat model selector)
    DOM.modelBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleModelPicker();
    });
    DOM.modelPickerList.addEventListener('click', (e) => {
      const item = e.target.closest('.model-picker-item');
      if (item) {
        selectModelForChat(item.dataset.key);
      }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.model-badge-wrapper')) {
        closeModelPicker();
      }
    });

    // Memory toggle
    DOM.settingMemoryEnabled.addEventListener('change', () => {
      DOM.memoryTextareaGroup.style.display = DOM.settingMemoryEnabled.checked ? '' : 'none';
    });

    // Toggle API key visibility
    DOM.btnToggleKey.addEventListener('click', () => {
      const input = DOM.settingApiKey;
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    // Range sliders
    DOM.settingTemperature.addEventListener('input', updateParamLabels);
    DOM.settingTopP.addEventListener('input', updateParamLabels);
    DOM.settingTopK.addEventListener('input', updateParamLabels);
    DOM.settingMinP.addEventListener('input', updateParamLabels);
    DOM.settingRepeatPenalty.addEventListener('input', updateParamLabels);
    DOM.settingMaxTokens.addEventListener('input', updateParamLabels);
    DOM.settingContextLength.addEventListener('input', updateParamLabels);

    // Chat
    DOM.btnClearChat.addEventListener('click', () => {
      const conv = getCurrentConversation();
      if (conv) {
        conv.messages = [];
        conv.title = 'New Conversation';
        conv.lastResponseId = null;
        saveConversations();
        renderConversationsList();
        renderChat();
      }
    });

    // Message Input
    DOM.messageInput.addEventListener('input', () => {
      autoResize();
      updateSendButton();
    });

    DOM.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    DOM.btnSend.addEventListener('click', sendMessage);
    DOM.btnStop.addEventListener('click', stopGeneration);

    // File attachment
    DOM.btnAttach.addEventListener('click', () => DOM.fileInput.click());
    DOM.fileInput.addEventListener('change', (e) => {
      for (const file of e.target.files) addImage(file);
      e.target.value = '';
    });

    // Paste images
    document.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          addImage(item.getAsFile());
        }
      }
    });

    // Drag & drop
    let dragCounter = 0;
    document.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types?.includes('Files')) {
        DOM.dropZone.classList.add('active');
      }
    });
    document.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        DOM.dropZone.classList.remove('active');
      }
    });
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      DOM.dropZone.classList.remove('active');
      const files = e.dataTransfer?.files;
      if (files) {
        for (const file of files) {
          if (file.type.startsWith('image/')) addImage(file);
        }
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSettings();
        closeModelsPanel();
        closeSidebar();
      }
    });
  }

  // ===== Init =====
  function init() {
    loadSettings();
    loadConversations();
    initEventListeners();
    renderConversationsList();

    if (state.conversations.length > 0) {
      if (!state.currentConversationId) {
        state.currentConversationId = state.conversations[0].id;
      }
    }

    renderChat();

    // Auto-load models on start
    if (state.settings.serverUrl) {
      fetchModels().then(models => {
        state.models = models;
        updateModelBadge();
      }).catch(() => { });
    }
  }

  init();
})();
