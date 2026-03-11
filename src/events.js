// ===== Event Listeners =====

import { DOM } from './dom.js';
import state from './state.js';
import { sendMessage, stopGeneration } from './chat.js';
import { openSettings, closeSettings, saveSettingsFromForm, updateParamLabels, refreshModels, showModelInfo, testConnection } from './settings.js';
import { openModelsPanel, closeModelsPanel, refreshModelsPanel, downloadModel } from './models.js';
import { openSkillsPanel, closeSkillsPanel, addOrUpdateSkill } from './skills.js';
import { getCurrentConversation, createConversation, updateConversationTitle, renderChat } from './conversations.js';
import { toggleModelPicker, closeModelPicker, selectModelForChat, openSidebar, closeSidebar, autoResize, updateSendButton, toggleSearch, updateSearchButton, toggleDeepResearch, updateDeepResearchButton } from './ui.js';
import { addImage } from './images.js';
import { saveConversations } from './storage.js';

export function initEventListeners() {
    // Sidebar
    DOM.btnMenu.addEventListener('click', openSidebar);
    DOM.sidebarOverlay.addEventListener('click', closeSidebar);
    DOM.btnNewChat.addEventListener('click', () => {
        createConversation();
        closeSidebar();
    });

    // Settings
    DOM.btnSettings.addEventListener('click', openSettings);
    DOM.btnCloseSettings.addEventListener('click', closeSettings);
    DOM.settingsOverlay.addEventListener('click', closeSettings);
    DOM.btnSaveSettings.addEventListener('click', saveSettingsFromForm);
    DOM.btnTestConnection.addEventListener('click', testConnection);
    DOM.btnRefreshModels.addEventListener('click', refreshModels);
    DOM.settingModel.addEventListener('change', showModelInfo);

    // Models panel
    DOM.btnModels.addEventListener('click', openModelsPanel);
    DOM.btnCloseModels.addEventListener('click', closeModelsPanel);
    DOM.modelsOverlay.addEventListener('click', closeModelsPanel);
    DOM.btnRefreshModelsPanel.addEventListener('click', () => {
        refreshModelsPanel();
    });
    DOM.btnDownloadModel.addEventListener('click', downloadModel);

    // Skills panel
    DOM.btnSkills.addEventListener('click', openSkillsPanel);
    DOM.btnCloseSkills.addEventListener('click', closeSkillsPanel);
    DOM.skillsOverlay.addEventListener('click', closeSkillsPanel);
    DOM.btnAddSkill.addEventListener('click', addOrUpdateSkill);

    // Model picker
    DOM.modelBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleModelPicker();
    });
    DOM.modelPickerList.addEventListener('click', (e) => {
        const item = e.target.closest('.model-picker-item');
        if (item) {
            selectModelForChat(item.dataset.key);
        }
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.model-badge-wrapper')) {
            closeModelPicker();
        }
    });

    // Memory toggle
    DOM.settingMemoryEnabled.addEventListener('change', () => {
        DOM.memoryTextareaGroup.style.display = DOM.settingMemoryEnabled.checked ? '' : 'none';
    });

    // Search toggle (input bar)
    DOM.btnSearch.addEventListener('click', toggleSearch);

    // Deep research toggle (input bar)
    if (DOM.btnDeepResearch) {
        DOM.btnDeepResearch.addEventListener('click', toggleDeepResearch);
    }

    // Search settings toggle
    DOM.settingSearchEnabled.addEventListener('change', () => {
        DOM.searxngUrlGroup.style.display = DOM.settingSearchEnabled.checked ? '' : 'none';
    });

    // Toggle API key visibility
    DOM.btnToggleKey.addEventListener('click', () => {
        const input = DOM.settingApiKey;
        input.type = input.type === 'password' ? 'text' : 'password';
    });

    // Range sliders
    DOM.settingTemperature.addEventListener('input', updateParamLabels);
    DOM.settingTopP.addEventListener('input', updateParamLabels);
    DOM.settingTopK.addEventListener('input', updateParamLabels);
    DOM.settingMinP.addEventListener('input', updateParamLabels);
    DOM.settingRepeatPenalty.addEventListener('input', updateParamLabels);
    DOM.settingMaxTokens.addEventListener('input', updateParamLabels);
    DOM.settingContextLength.addEventListener('input', updateParamLabels);

    // Chat
    DOM.btnClearChat.addEventListener('click', () => {
        const conv = getCurrentConversation();
        if (conv) {
            conv.messages = [];
            conv.title = 'New Conversation';
            conv.lastResponseId = null;
            state.settings.deepResearcherEnabled = false;
            state.settings.searchEnabled = false;
            updateSearchButton();
            if (DOM.btnDeepResearch) updateDeepResearchButton();
            import('./storage.js').then(m => m.saveSettings());
            saveConversations();
            renderConversationsList();
            renderChat();
        }
    });

    // Message Input
    DOM.messageInput.addEventListener('input', () => {
        autoResize();
        updateSendButton();
    });

    DOM.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    DOM.btnSend.addEventListener('click', sendMessage);
    DOM.btnStop.addEventListener('click', stopGeneration);

    // File attachment
    DOM.btnAttach.addEventListener('click', () => DOM.fileInput.click());
    DOM.fileInput.addEventListener('change', (e) => {
        for (const file of e.target.files) addImage(file);
        e.target.value = '';
    });

    // Paste images
    document.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                addImage(item.getAsFile());
            }
        }
    });

    // Drag & drop
    let dragCounter = 0;
    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        if (e.dataTransfer?.types?.includes('Files')) {
            DOM.dropZone.classList.add('active');
        }
    });
    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            DOM.dropZone.classList.remove('active');
        }
    });
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        DOM.dropZone.classList.remove('active');
        const files = e.dataTransfer?.files;
        if (files) {
            for (const file of files) {
                if (file.type.startsWith('image/')) addImage(file);
            }
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSettings();
            closeModelsPanel();
            closeSkillsPanel();
            closeSidebar();
        }
    });
}
