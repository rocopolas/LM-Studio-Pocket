// ===== SearXNG Web Search =====

import { CONFIG } from './config.js';
import state from './state.js';

/**
 * Search the web via SearXNG and return formatted results.
 * Uses the Vite proxy (/searxng/) to avoid CORS issues.
 * @param {string} query - The search query
 * @returns {Promise<{results: Array, contextText: string}>}
 */
export async function searchWeb(query) {
    // Use proxy path for local instances, direct URL for remote
    const searxngUrl = state.settings.searxngUrl;
    const isLocal = searxngUrl.includes('127.0.0.1') || searxngUrl.includes('localhost');
    const baseUrl = isLocal ? '/searxng' : searxngUrl;

    const url = new URL(`${baseUrl}/search`, window.location.origin);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('categories', 'general');
    url.searchParams.set('language', 'auto');

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`SearXNG HTTP ${resp.status}`);

    const data = await resp.json();
    const raw = data.results || [];

    const results = raw.slice(0, CONFIG.SEARCH_MAX_RESULTS).map((r, i) => ({
        index: i + 1,
        title: r.title || '',
        url: r.url || '',
        content: (r.content || '').slice(0, 500),
        engine: r.engine || '',
    }));

    // Build text block for system prompt injection
    const contextText = results.length > 0
        ? results.map(r =>
            `[${r.index}] ${r.title}\nURL: ${r.url}\n${r.content}`
        ).join('\n\n')
        : '';

    return { results, contextText };
}
