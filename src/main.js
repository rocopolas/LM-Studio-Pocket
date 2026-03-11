// ===== Application Entry Point =====

import state from './state.js';
import { loadSettings, loadConversations, loadSkills } from './storage.js';
import { initEventListeners } from './events.js';
import { renderConversationsList, renderChat } from './conversations.js';
import { updateModelBadge, updateSearchButton } from './ui.js';
import { updateSkillBadge } from './skills.js';
import { fetchModels } from './api.js';
import { getCsrfToken } from './csrf.js';

async function init() {
    try {
        await loadSettings();
        await loadConversations();
        await loadSkills();
        getCsrfToken(); // Pre-fetch CSRF token
    } catch (e) {
        console.error('Failed to initialize storage:', e);
    }

    initEventListeners();
    renderConversationsList();

    if (state.conversations.length > 0) {
        if (!state.currentConversationId) {
            state.currentConversationId = state.conversations[0].id;
        }
    }

    renderChat();
    updateSearchButton();
    updateSkillBadge();

    // Auto-load models on start
    if (state.settings.serverUrl) {
        fetchModels().then(models => {
            state.models = models;
            updateModelBadge();
        }).catch(() => { });
    }
}

init();
