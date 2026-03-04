// ===== Utility Functions =====

import { CONFIG } from './config.js';
import { DOM } from './dom.js';

export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Ahora';
    if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

const TOAST_ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

export function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${TOAST_ICONS[type] || 'ℹ'}</span><span>${message}</span>`;
    DOM.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, CONFIG.TOAST_DURATION);
}

export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
