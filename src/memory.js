// ===== Memory Extraction =====

import { CONFIG } from './config.js';
import { DOM } from './dom.js';
import state from './state.js';
import { showToast } from './utils.js';
import { getHeaders } from './api.js';
import { saveSettings } from './storage.js';
import { getCurrentConversation } from './conversations.js';

export async function extractAndSaveMemory(userText, assistantText, attempt = 1) {
    if (!state.settings.memoryEnabled) return;
    if (!userText || !assistantText) return;

    // Strip <think>...</think> reasoning tags from assistant response
    assistantText = assistantText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (!assistantText) return;

    const currentMemory = state.settings.memory.trim();
    const extractionPrompt = `/no_think
You are a memory extraction assistant. Your ONLY job is to analyze a conversation exchange and extract important facts about the user that should be remembered for future conversations. Do NOT use <think> tags. Respond directly.

Current saved memory:
${currentMemory ? `"""\n${currentMemory}\n"""` : '(empty)'}

Latest exchange:
User: ${userText}
Assistant: ${assistantText}

Rules:
- Extract ONLY factual, personal, or preference-related information about the user (name, profession, interests, tech stack, language preferences, important context, etc.)
- Do NOT extract trivial or temporary information (questions about general knowledge, greetings, etc.)
- Do NOT duplicate information already in the saved memory
- If there is nothing new worth remembering, respond with EXACTLY: [NO_UPDATE]
- If there ARE new facts, respond with ONLY the new bullet points to add (starting each with "- "), nothing else
- Keep each bullet point concise (one line)
- Respond in the same language the user used
- Do NOT wrap your response in any tags`;

    try {
        const conv = getCurrentConversation();
        const model = conv?.model || state.settings.model;
        if (!model) return;

        const resp = await fetch(`${state.settings.serverUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: extractionPrompt },
                    { role: 'user', content: 'Extract important facts from the exchange above.' },
                ],
                temperature: 0.1,
                max_tokens: 256,
                stream: false,
            }),
        });

        if (!resp.ok) return;

        const data = await resp.json();
        const rawResult = (data.choices?.[0]?.message?.content || '').trim();

        if (!rawResult || rawResult.includes('[NO_UPDATE]')) return;

        const bulletPoints = rawResult
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('- '))
            .join('\n');

        if (!bulletPoints) return;

        const newMemory = currentMemory
            ? `${currentMemory}\n${bulletPoints}`
            : bulletPoints;

        state.settings.memory = newMemory;
        saveSettings();

        if (DOM.settingMemory) {
            DOM.settingMemory.value = newMemory;
        }

        showToast('🧠 Memory updated', 'success');
    } catch (e) {
        if (attempt < CONFIG.MAX_MEMORY_RETRIES) {
            const delay = attempt * CONFIG.MEMORY_DELAY_MS;
            console.warn(`Memory extraction attempt ${attempt} failed, retrying in ${delay}ms...`);
            setTimeout(() => extractAndSaveMemory(userText, assistantText, attempt + 1), delay);
        } else {
            console.warn('Memory extraction failed after all retries:', e.message);
        }
    }
}
