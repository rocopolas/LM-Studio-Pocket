// ===== Markdown Rendering =====

import { escapeHtml } from './utils.js';

let _markedRenderer = null;

function _initMarked() {
    if (_markedRenderer || typeof marked === 'undefined') return;
    marked.setOptions({ breaks: true, gfm: true });
    _markedRenderer = new marked.Renderer();
    _markedRenderer.code = function (obj) {
        const code = typeof obj === 'object' ? obj.text : obj;
        const lang = typeof obj === 'object' ? obj.lang : arguments[1];
        const highlighted = _highlightCode(code, lang);
        const langLabel = lang || 'code';
        return `<pre><div class="code-header"><span>${escapeHtml(langLabel)}</span><button class="btn-copy-code" onclick="window.__copyCode(this)">📋 Copiar</button></div><code class="hljs language-${escapeHtml(langLabel)}">${highlighted}</code></pre>`;
    };
}

function _highlightCode(code, lang) {
    if (typeof hljs === 'undefined') return escapeHtml(code);
    try {
        return lang && hljs.getLanguage(lang)
            ? hljs.highlight(code, { language: lang }).value
            : hljs.highlightAuto(code).value;
    } catch (_) {
        return escapeHtml(code);
    }
}

export function renderMarkdown(text) {
    if (typeof marked === 'undefined') return escapeHtml(text).replace(/\n/g, '<br>');
    _initMarked();
    return marked.parse(text, { renderer: _markedRenderer });
}

// Global handler for copy code buttons
window.__copyCode = function (btn) {
    const code = btn.closest('pre').querySelector('code').textContent;
    navigator.clipboard.writeText(code).then(() => {
        btn.textContent = '✓ Copied';
        setTimeout(() => { btn.innerHTML = '📋 Copiar'; }, 2000);
    });
};
