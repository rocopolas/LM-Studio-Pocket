// ===== Shared Application State (singleton) =====

const state = {
    conversations: [],
    currentConversationId: null,
    settings: {
        serverUrl: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SERVER_URL) || 'http://localhost:1234',
        apiKey: '',
        model: '',
        systemPrompt: '',
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        minP: 0.05,
        repeatPenalty: 1.1,
        maxTokens: 2048,
        contextLength: 4096,
        memoryEnabled: true,
        memory: '',
        searchEnabled: false,
        searxngUrl: 'http://127.0.0.1:8080',
        crawl4aiEnabled: false,
        crawl4aiUrl: 'http://127.0.0.1:11235',
        deepResearcherEnabled: false,
    },
    models: [],
    skills: [],           // { id, name, emoji, prompt }
    activeSkillId: null,
    pendingImages: [],    // { dataUrl, name }
    messageQueue: [],     // { text, images: [dataUrl] }
    isGenerating: false,
    generatingConvId: null,
    abortController: null,
};

export default state;
