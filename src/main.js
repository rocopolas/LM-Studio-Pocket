// ===== Application Entry Point =====

import state from './state.js';
import { loadSettings, loadConversations } from './storage.js';
import { initEventListeners } from './events.js';
import { renderConversationsList, renderChat } from './conversations.js';
import { updateModelBadge } from './ui.js';
import { fetchModels } from './api.js';

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
