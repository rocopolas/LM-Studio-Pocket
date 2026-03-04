// ===== Image Handling =====

import { CONFIG } from './config.js';
import { DOM } from './dom.js';
import state from './state.js';
import { showToast, escapeHtml } from './utils.js';
import { updateSendButton } from './ui.js';

export function compressImage(dataUrl, maxDim, callback) {
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
        callback(canvas.toDataURL('image/jpeg', CONFIG.IMAGE_QUALITY));
    };
    img.onerror = () => callback(dataUrl);
    img.src = dataUrl;
}

export function addImage(file) {
    if (!file.type.startsWith('image/')) {
        showToast('Only images are allowed', 'warning');
        return;
    }
    if (file.size > CONFIG.IMAGE_MAX_SIZE) {
        showToast('Image is too large (max 20MB)', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        compressImage(e.target.result, CONFIG.IMAGE_MAX_DIM, (compressedDataUrl) => {
            state.pendingImages.push({ dataUrl: compressedDataUrl, name: file.name });
            renderImagePreviews();
        });
    };
    reader.readAsDataURL(file);
}

export function addImageFromDataUrl(dataUrl) {
    compressImage(dataUrl, CONFIG.IMAGE_MAX_DIM, (compressedDataUrl) => {
        state.pendingImages.push({ dataUrl: compressedDataUrl, name: 'clipboard' });
        renderImagePreviews();
    });
}

export function removeImage(index) {
    state.pendingImages.splice(index, 1);
    renderImagePreviews();
}

export function renderImagePreviews() {
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
