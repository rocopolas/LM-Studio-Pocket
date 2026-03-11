// ===== Markdown Rendering =====

import { escapeHtml } from './utils.js';

let _markedRenderer = null;

function _initMarked() {
    if (_markedRenderer || typeof marked === 'undefined') return;
    marked.setOptions({ breaks: true, gfm: true });

    // Setup KaTeX extension if available
    if (typeof markedKatex !== 'undefined') {
        marked.use(markedKatex({ throwOnError: false }));
    }

    _markedRenderer = new marked.Renderer();
    _markedRenderer.code = function (obj) {
        const code = typeof obj === 'object' ? obj.text : obj;
        const lang = typeof obj === 'object' ? obj.lang : arguments[1];
        const highlighted = _highlightCode(code, lang);
        const langLabel = lang || 'code';
        const isHtml = langLabel.toLowerCase() === 'html';
        const previewBtn = isHtml ? `<button class="btn-preview-html" onclick="window.__previewHtml(event)">▶ Preview</button>` : '';
        return `<pre><div class="code-header"><span>${escapeHtml(langLabel)}</span><div class="code-header-actions">${previewBtn}<button class="btn-copy-code" onclick="window.__copyCode(event)">📋 Copiar</button></div></div><code class="hljs language-${escapeHtml(langLabel)}">${highlighted}</code></pre>`;
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
    const raw = marked.parse(text, { renderer: _markedRenderer });
    // Sanitize to prevent XSS — allow safe HTML tags, block scripts/event handlers
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(raw, {
            ADD_TAGS: ['iframe'],
            ADD_ATTR: ['target', 'rel', 'class', 'onclick', 'srcdoc', 'sandbox'],
            ALLOW_DATA_ATTR: false,
        });
    }
    return raw;
}

// Global handler for copy code buttons
window.__copyCode = function (event) {
    const btn = event.currentTarget || event.target;
    // Find the nearest <pre> parent and then search for the <code> block inside it
    const pre = btn.closest('pre');
    if (!pre) return;

    const codeEl = pre.querySelector('code');
    if (!codeEl) return;

    const code = codeEl.textContent;
    navigator.clipboard.writeText(code).then(() => {
        const originalText = btn.innerHTML;
        btn.textContent = '✓ Copied';
        setTimeout(() => {
            // Only revert if the button is still in the DOM and says Copied
            if (btn.textContent === '✓ Copied') {
                btn.innerHTML = originalText;
            }
        }, 2000);
    }).catch(e => console.error('Failed to copy code:', e));
};

// Global handler for HTML preview
window.__previewHtml = function (event) {
    const btn = event.currentTarget || event.target;
    const pre = btn.closest('pre');
    if (!pre) return;
    const codeEl = pre.querySelector('code');
    if (!codeEl) return;

    const htmlContent = codeEl.textContent;

    // Create preview modal
    const modal = document.createElement('div');
    modal.className = 'html-preview-modal';
    modal.innerHTML = `
        <div class="html-preview-header">
            <span>HTML Preview</span>
            <button class="btn-close-preview" onclick="this.closest('.html-preview-modal').remove()">✕ Close</button>
        </div>
        <iframe class="html-preview-iframe" sandbox="allow-scripts" srcdoc=""></iframe>
    `;
    document.body.appendChild(modal);

    // Set srcdoc after adding to DOM
    const iframe = modal.querySelector('iframe');
    iframe.srcdoc = htmlContent;

    // Close on Escape
    const onKey = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', onKey);
        }
    };
    document.addEventListener('keydown', onKey);
};
