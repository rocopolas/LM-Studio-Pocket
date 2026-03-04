// ===== localStorage Operations =====

import { CONFIG } from './config.js';
import state from './state.js';

export function loadSettings() {
    try {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS);
        if (saved) Object.assign(state.settings, JSON.parse(saved));
    } catch (_) { }
}

export function saveSettings() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
}

export function loadConversations() {
    try {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.CONVERSATIONS);
        if (saved) state.conversations = JSON.parse(saved);
    } catch (_) { }
}

export function saveConversations() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.CONVERSATIONS, JSON.stringify(state.conversations));
}
