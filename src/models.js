// ===== Models Management Panel =====

import { DOM } from './dom.js';
import state from './state.js';
import { showToast, escapeHtml } from './utils.js';
import { saveSettings } from './storage.js';
import { fetchModels, getHeaders } from './api.js';
import { updateModelBadge } from './ui.js';
import { populateModelSelect } from './settings.js';

export function openModelsPanel() {
    DOM.modelsPanel.classList.add('active');
    DOM.modelsOverlay.classList.add('active');
    refreshModelsPanel();
}

export function closeModelsPanel() {
    DOM.modelsPanel.classList.remove('active');
    DOM.modelsOverlay.classList.remove('active');
}

export async function refreshModelsPanel() {
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
    for (const m of llms) {
        DOM.modelsListContainer.appendChild(createModelCard(m));
    }
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
    const resp = await fetch(`/api/proxy/api/v1/models/load`, {
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

    const resp = await fetch(`/api/proxy/api/v1/models/unload`, {
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

export async function downloadModel() {
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
        const resp = await fetch(`/api/proxy/api/v1/models/download`, {
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
        const resp = await fetch(`/api/proxy/api/v1/models/download/status`, {
            headers: getHeaders(),
        });
        if (!resp.ok) return;
        const data = await resp.json();
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
            setTimeout(() => pollDownloadStatus(jobId, modelId), 5000);
        }
    } catch (_) {
        setTimeout(() => pollDownloadStatus(jobId, modelId), 5000);
    }
}
