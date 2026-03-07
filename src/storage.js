import state from './state.js';

export async function loadSettings() {
    try {
        const resp = await fetch('/api/storage/settings');
        if (resp.ok) {
            const saved = await resp.json();
            if (saved && Object.keys(saved).length > 0) {
                Object.assign(state.settings, saved);
            }
        }
    } catch (e) {
        console.warn('Failed to load settings:', e);
    }
}

export async function saveSettings() {
    try {
        await fetch('/api/storage/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.settings)
        });
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

export async function loadConversations() {
    try {
        const resp = await fetch('/api/storage/conversations');
        if (resp.ok) {
            const saved = await resp.json();
            if (Array.isArray(saved) && saved.length > 0) {
                state.conversations = saved;
            }
        }
    } catch (e) {
        console.warn('Failed to load conversations:', e);
    }
}

export async function saveConversations() {
    try {
        await fetch('/api/storage/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.conversations)
        });
    } catch (e) {
        console.error('Failed to save conversations:', e);
    }
}
