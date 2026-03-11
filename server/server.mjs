import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Ensure data dir exists
const dataDir = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Setup Database
const db = new sqlite3.Database(path.join(dataDir, 'database.sqlite'));
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)`);
});

const getKV = (key) => {
    return new Promise((resolve, reject) => {
        db.get(`SELECT value FROM kv WHERE key = ?`, [key], (err, row) => {
            if (err) return reject(err);
            if (row && row.value) {
                try {
                    resolve(JSON.parse(row.value));
                } catch {
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        });
    });
};

const setKV = (key, value) => {
    return new Promise((resolve, reject) => {
        const str = JSON.stringify(value);
        db.run(`INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [key, str], (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
};

// State Migration from previous JSON implementation
async function migrateOldFiles() {
    const settingsPath = path.join(dataDir, 'settings.json');
    if (fs.existsSync(settingsPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const existing = await getKV('settings');
            if (!existing) {
                await setKV('settings', data);
                console.log('Migrated settings.json to SQLite');
            }
            fs.renameSync(settingsPath, settingsPath + '.bak');
        } catch (e) {
            console.error('Migration settings error:', e);
        }
    }
    const convPath = path.join(dataDir, 'conversations.json');
    if (fs.existsSync(convPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(convPath, 'utf8'));
            const existing = await getKV('conversations');
            if (!existing) {
                await setKV('conversations', data);
                console.log('Migrated conversations.json to SQLite');
            }
            fs.renameSync(convPath, convPath + '.bak');
        } catch (e) {
            console.error('Migration conv error:', e);
        }
    }
}
migrateOldFiles();

// Storage Endpoints for the UI to read/write bulk states
app.get('/api/storage/settings', async (req, res) => {
    const data = await getKV('settings') || {};
    res.json(data);
});

app.post('/api/storage/settings', async (req, res) => {
    await setKV('settings', req.body);
    res.json({ success: true });
});

app.get('/api/storage/conversations', async (req, res) => {
    const data = await getKV('conversations') || [];
    res.json(data);
});

app.post('/api/storage/conversations', async (req, res) => {
    await setKV('conversations', req.body);
    res.json({ success: true });
});

// SSE active connections list (chatId mapping to Response object)
const sseClients = new Map();

app.get('/api/stream/:chatId', (req, res) => {
    const { chatId } = req.params;

    // Setup SSE HTTP Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Important to flush headers immediately
    res.flushHeaders();

    // Send an initial comment to forcefully trigger the 'open' event on the browser's EventSource Native API
    res.write(':\n\n');

    sseClients.set(chatId, res);

    req.on('close', () => {
        sseClients.delete(chatId);
    });
});

const sendSseToClient = (chatId, eventType, data) => {
    const res = sseClients.get(chatId);
    if (res) {
        res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
    }
};

// LM Studio Proxy / Generator Endpoint

app.get('/api/models', async (req, res) => {
    const targetUrl = req.headers['x-target-url'] || 'http://localhost:1234';
    try {
        const fetchOptions = {
            method: 'GET',
            headers: req.headers['authorization'] ? { 'authorization': req.headers['authorization'] } : {}
        };
        const response = await fetch(`${targetUrl}/api/v1/models`, fetchOptions);
        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`LM Studio error ${response.status}: ${errBody}`);
        }
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Model fetch error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Proxy for loading a model
app.post('/api/models/load', async (req, res) => {
    const targetUrl = req.headers['x-target-url'] || 'http://localhost:1234';
    try {
        const fetchOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(req.headers['authorization'] && { 'authorization': req.headers['authorization'] })
            },
            body: JSON.stringify(req.body)
        };
        const response = await fetch(`${targetUrl}/api/v1/models/load`, fetchOptions);
        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`LM Studio error ${response.status}: ${errBody}`);
        }
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Model load error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Proxy for unloading a model
app.post('/api/models/unload', async (req, res) => {
    const targetUrl = req.headers['x-target-url'] || 'http://localhost:1234';
    try {
        const fetchOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(req.headers['authorization'] && { 'authorization': req.headers['authorization'] })
            },
            body: JSON.stringify(req.body)
        };
        const response = await fetch(`${targetUrl}/api/v1/models/unload`, fetchOptions);
        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`LM Studio error ${response.status}: ${errBody}`);
        }
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Model unload error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Proxy for downloading a model
app.post('/api/models/download', async (req, res) => {
    const targetUrl = req.headers['x-target-url'] || 'http://localhost:1234';
    try {
        const fetchOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(req.headers['authorization'] && { 'authorization': req.headers['authorization'] })
            },
            body: JSON.stringify(req.body)
        };
        const response = await fetch(`${targetUrl}/api/v1/models/download`, fetchOptions);
        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`LM Studio error ${response.status}: ${errBody}`);
        }
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Model download error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Proxy for checking download status
app.get('/api/models/download/status', async (req, res) => {
    const targetUrl = req.headers['x-target-url'] || 'http://localhost:1234';
    try {
        const fetchOptions = {
            method: 'GET',
            headers: req.headers['authorization'] ? { 'authorization': req.headers['authorization'] } : {}
        };
        const response = await fetch(`${targetUrl}/api/v1/models/download/status`, fetchOptions);
        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`LM Studio error ${response.status}: ${errBody}`);
        }
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Model download status error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Ensure model is loaded with the correct context_length before chatting
async function ensureModelContext(lmUrl, modelName, contextLength, conversationId) {
    if (!contextLength || !modelName) return modelName;

    try {
        const modelsResp = await fetch(`${lmUrl}/api/v1/models`);
        if (!modelsResp.ok) return modelName;

        const modelsData = await modelsResp.json();
        const allModels = modelsData.models || [];

        // Find the model by key or loaded instance id
        let modelInfo = null;
        for (const m of allModels) {
            if (m.key === modelName) { modelInfo = m; break; }
            if (m.loaded_instances && m.loaded_instances.some(li => li.id === modelName)) {
                modelInfo = m; break;
            }
        }
        if (!modelInfo) return modelName; // not found in catalog, let LM Studio handle it

        const loaded = modelInfo.loaded_instances || [];

        if (loaded.length > 0) {
            const inst = loaded[0];
            // If already loaded with enough context, just return the instance id
            if (inst.context_length && inst.context_length >= contextLength) {
                return inst.id || modelName;
            }

            // Context too small → unload and reload
            console.log(`Context mismatch: loaded=${inst.context_length}, configured=${contextLength}. Reloading model...`);
            sendSseToClient(conversationId, 'model_load.start', {});

            await fetch(`${lmUrl}/api/v1/models/unload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instance_id: inst.id })
            });
        } else {
            // Model not loaded at all → load it
            console.log(`Model not loaded. Loading with context_length=${contextLength}...`);
            sendSseToClient(conversationId, 'model_load.start', {});
        }

        // Load model with correct context_length
        const loadResp = await fetch(`${lmUrl}/api/v1/models/load`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelInfo.key, context_length: contextLength })
        });

        if (loadResp.ok) {
            const loadData = await loadResp.json();
            return loadData.id || modelInfo.key;
        }

        return modelInfo.key;
    } catch (e) {
        console.warn('Model context pre-check failed:', e.message);
        return modelName;
    }
}

app.post('/api/chat', async (req, res) => {
    const { modelOptions, messages, systemPrompt, conversationId, assistantMsgId, lmUrl, searchContext } = req.body;

    // We instantly acknowledge the receipt
    res.json({ success: true, message: 'Generation started in background' });

    // The entire LM Studio connection now runs server-side!
    let modelName = modelOptions.model;
    const isDeepResearch = modelOptions.deepResearcherEnabled;
    let url = `${lmUrl}/v1/chat/completions`;

    // Ensure model is loaded with the configured context_length
    modelName = await ensureModelContext(lmUrl, modelName, modelOptions.contextLength, conversationId);

    let finalMessages = [];
    let sysContent = systemPrompt || '';
    if (searchContext) {
        sysContent += `\n\n[Web Search Results]\n${searchContext}`;
    }
    if (sysContent.trim()) {
        finalMessages.push({ role: 'system', content: sysContent.trim() });
    }

    if (Array.isArray(messages)) {
        for (const m of messages) {
            if (m && m.role) {
                // Ensure content is defined so it doesn't drop during stringify
                finalMessages.push({ role: m.role, content: m.content || ' ' });
            }
        }
    }

    const payload = {
        model: modelName,
        messages: finalMessages,
        temperature: modelOptions.temperature ?? 0.7,
        max_tokens: modelOptions.maxTokens ?? 2048,
        stream: true,
        stream_options: { include_usage: true }
    };

    try {
        sendSseToClient(conversationId, 'model_load.start', {});

        const fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        };

        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`LM Studio error ${response.status}: ${errBody}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        sendSseToClient(conversationId, 'message.start', {});

        let currentText = '';
        let currentReasoning = '';
        let inReasoning = false;

        let startTime = Date.now();
        let firstTokenTime = null;
        let tokenCount = 0;
        let finalUsage = null;

        let lastSaveTime = Date.now();

        // Safe updater to modify conversation state periodically or on end
        const updateDbRecord = async (isComplete = false) => {
            const convs = await getKV('conversations') || [];
            const c = convs.find((c) => c.id === conversationId);
            if (c) {
                const m = c.messages.find((ms) => ms.id === assistantMsgId);
                if (m) {
                    m.text = currentText;
                    if (currentReasoning) m.reasoning = currentReasoning;
                    if (isComplete) m.isComplete = true;
                    await setKV('conversations', convs);
                }
            }
        };

        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);

                if (!line) continue;
                if (line === 'data: [DONE]') break;

                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6);
                    try {
                        const parsed = JSON.parse(dataStr);
                        if (parsed.usage) {
                            finalUsage = parsed.usage;
                        }
                        if (!parsed.choices || parsed.choices.length === 0) continue;

                        const delta = parsed.choices[0].delta;
                        if (!delta) continue;

                        if (firstTokenTime === null && (delta.content || delta.reasoning_content)) {
                            firstTokenTime = Date.now();
                        }

                        // Reasoning checks (LM Studio proprietary tag)
                        if (delta.reasoning_content !== undefined) {
                            if (!inReasoning && delta.reasoning_content) {
                                inReasoning = true;
                                sendSseToClient(conversationId, 'reasoning.start', {});
                            }
                            currentReasoning += (delta.reasoning_content || '');
                            sendSseToClient(conversationId, 'reasoning.delta', { content: delta.reasoning_content || '' });
                            if (delta.reasoning_content) tokenCount++;
                        } else if (inReasoning && !delta.reasoning_content && !delta.content) {
                            inReasoning = false;
                            sendSseToClient(conversationId, 'reasoning.end', {});
                        }

                        if (delta.content !== undefined) {
                            if (inReasoning) {
                                inReasoning = false;
                                sendSseToClient(conversationId, 'reasoning.end', {});
                            }
                            currentText += (delta.content || '');
                            sendSseToClient(conversationId, 'message.delta', { content: delta.content || '' });
                            if (delta.content) tokenCount++;
                        }

                    } catch (e) {
                        // The JSON was valid structurally from the split but unparsable, or partial
                        console.error('Buffer JSON Parse Error:', e.message, 'Raw:', dataStr);
                    }
                }
            }

            // Periodic auto-save DB every 1 sec to protect against backend crash
            if (Date.now() - lastSaveTime > 1000) {
                lastSaveTime = Date.now();
                await updateDbRecord(false);
            }
        }

        // Finish state
        await updateDbRecord(true);
        sendSseToClient(conversationId, 'message.end', {});
        
        const endTime = Date.now();
        const ttft = firstTokenTime ? (firstTokenTime - startTime) / 1000 : 0;
        const totalTokens = finalUsage ? finalUsage.completion_tokens : tokenCount;
        const totalSeconds = (endTime - (firstTokenTime || startTime)) / 1000;
        const tps = totalSeconds > 0 ? (totalTokens / totalSeconds) : 0;

        const stats = {
            time_to_first_token_seconds: ttft,
            total_output_tokens: totalTokens,
            tokens_per_second: tps
        };

        sendSseToClient(conversationId, 'chat.end', { result: { stats } });

    } catch (err) {
        console.error('Server side generation error:', err);
        sendSseToClient(conversationId, 'error', { error: { message: err.message } });
    }
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend API Engine active via SSE on port ${PORT}`);
});
