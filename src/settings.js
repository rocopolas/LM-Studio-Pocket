// ===== Settings Panel UI =====

import { DOM } from './dom.js';
import state from './state.js';
import { showToast, escapeHtml } from './utils.js';
import { saveSettings } from './storage.js';
import { fetchModels, getHeaders } from './api.js';
import { updateModelBadge, updateSearchButton } from './ui.js';

export function openSettings() {
    populateSettingsForm();
    DOM.settingsPanel.classList.add('active');
    DOM.settingsOverlay.classList.add('active');
}

export function closeSettings() {
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
    DOM.settingSearchEnabled.checked = state.settings.searchEnabled;
    DOM.settingSearxngUrl.value = state.settings.searxngUrl;
    DOM.searxngUrlGroup.style.display = state.settings.searchEnabled ? '' : 'none';

    DOM.settingCrawl4aiUrl.value = state.settings.crawl4aiUrl;

    updateParamLabels();
    populateModelSelect();
}

export function saveSettingsFromForm() {
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
    state.settings.searchEnabled = DOM.settingSearchEnabled.checked;
    state.settings.searxngUrl = DOM.settingSearxngUrl.value.replace(/\/+$/, '');
    state.settings.crawl4aiUrl = DOM.settingCrawl4aiUrl.value.replace(/\/+$/, '');

    saveSettings();
    updateModelBadge();
    updateSearchButton();
    showToast('Settings saved', 'success');
    closeSettings();
}

export function updateParamLabels() {
    DOM.labelTemp.textContent = parseFloat(DOM.settingTemperature.value).toFixed(2);
    DOM.labelTopP.textContent = parseFloat(DOM.settingTopP.value).toFixed(2);
    DOM.labelTopK.textContent = DOM.settingTopK.value;
    DOM.labelMinP.textContent = parseFloat(DOM.settingMinP.value).toFixed(2);
    DOM.labelRepeat.textContent = parseFloat(DOM.settingRepeatPenalty.value).toFixed(2);
    DOM.labelMaxTokens.textContent = DOM.settingMaxTokens.value;
    DOM.labelContextLength.textContent = DOM.settingContextLength.value;
}

export function populateModelSelect() {
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
            const loaded = m.loaded_instances?.length > 0 ? ' ● Loaded' : '';
            const vision = m.capabilities?.vision ? ' 👁️ Vision' : '';
            opt.textContent = `${m.display_name} (${m.params_string || '?'})${vision}${loaded}`;
            if (m.key === state.settings.model) opt.selected = true;
            select.appendChild(opt);
        }
    }
}

export async function refreshModels() {
    DOM.btnRefreshModels.querySelector('svg').style.animation = 'spin 0.6s linear infinite';
    DOM.modelInfo.innerHTML = '<div class="spinner"></div>';
    try {
        state.models = await fetchModels();
        populateModelSelect();
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

export function showModelInfo() {
    const key = DOM.settingModel.value;
    const model = state.models.find(m => m.key === key);
    if (!model) {
        DOM.modelInfo.innerHTML = '';
        return;
    }
    const tags = [];
    if (model.architecture) tags.push(`<span class="info-tag">${model.architecture}</span>`);
    if (model.quantization?.name) tags.push(`<span class="info-tag">${model.quantization.name}</span>`);
    if (model.capabilities?.vision) tags.push(`<span class="info-tag vision">👁️ Vision</span>`);
    if (model.capabilities?.trained_for_tool_use) tags.push(`<span class="info-tag">🔧 Tools</span>`);
    if (model.loaded_instances?.length > 0) tags.push(`<span class="info-tag" style="color:var(--success)">● Loaded</span>`);
    const sizeMB = (model.size_bytes / (1024 * 1024)).toFixed(0);
    tags.push(`<span class="info-tag">${sizeMB} MB</span>`);
    tags.push(`<span class="info-tag">ctx ${model.max_context_length}</span>`);
    DOM.modelInfo.innerHTML = tags.join('');
}

export async function testConnection() {
    DOM.connectionStatus.className = 'connection-status';
    DOM.connectionStatus.style.display = 'none';
    DOM.btnTestConnection.disabled = true;
    DOM.btnTestConnection.innerHTML = '<div class="spinner"></div> Testing...';

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
        state.models = data.models || [];
        populateModelSelect();
    } catch (e) {
        DOM.connectionStatus.className = 'connection-status error';
        DOM.connectionStatus.textContent = `✕ Error: ${e.message}`;
    } finally {
        DOM.connectionStatus.style.display = '';
        DOM.btnTestConnection.disabled = false;
        DOM.btnTestConnection.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      Probar Conexión
    `;
    }
}
