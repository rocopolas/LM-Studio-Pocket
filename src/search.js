// ===== SearXNG Web Search =====

import { CONFIG } from './config.js';
import state from './state.js';
import { secureFetch } from './csrf.js';

export async function scrapeUrlsWithCrawl4AI(urls) {
    const crawlUrl = state.settings.crawl4aiUrl;
    const isLocal = crawlUrl.includes('127.0.0.1') || crawlUrl.includes('localhost');
    const baseUrl = isLocal ? '/crawl4ai' : crawlUrl;

    try {
        const response = await fetch(`${baseUrl}/crawl`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: urls, priority: 10 })
        });

        if (!response.ok) return null;

        const data = await response.json();
        let results = null;
        if (data.results) {
            results = data.results;
        } else if (data.task_id) {
            let attempts = 0;
            while (attempts < 15) { // Max 30 seconds
                await new Promise(r => setTimeout(r, 2000));
                const taskResp = await fetch(`${baseUrl}/task/${data.task_id}`);
                if (!taskResp.ok) { attempts++; continue; }
                const taskData = await taskResp.json();

                if (taskData.status === 'completed' || taskData.status === 'success' || taskData.results) {
                    results = taskData.results || taskData;
                    break;
                }
                if (taskData.status === 'failed' || taskData.status === 'error') break;
                attempts++;
            }
        }

        if (results && !Array.isArray(results) && results.data) results = results.data;
        else if (results && !Array.isArray(results) && results.results) results = results.results;

        if (Array.isArray(results)) {
            const map = {};
            for (const r of results) {
                if (!r || !r.url) continue;
                let content = r.markdown;
                if (content && typeof content === 'object') {
                    content = content.fit_markdown || content.raw_markdown || content.markdown || '';
                }
                if (!content && r.html) content = r.html;
                if (content) {
                    map[r.url] = content;
                }
            }
            return map;
        }
    } catch (e) {
        console.warn("Crawl4AI error:", e);
    }
    return null;
}

/**
 * Search the web via SearXNG and optionally scrape content via Crawl4AI.
 * Uses the Vite proxies to avoid CORS issues.
 * @param {string} query - The search query
 * @returns {Promise<{results: Array, contextText: string}>}
 */
export async function searchWeb(query) {
    // 1. Fetch basic search results from SearXNG
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

    // Limit to configured max results depending on mode
    const maxResults = state.settings.deepResearcherEnabled
        ? CONFIG.DEEP_RESEARCHER_MAX_RESULTS
        : CONFIG.SEARCH_MAX_RESULTS;

    let results = raw.slice(0, maxResults).map((r, i) => ({
        index: i + 1,
        title: r.title || '',
        url: r.url || '',
        content: (r.content || '').slice(0, 500),
        engine: r.engine || '',
    }));

    // 2. Scrape full content with Crawl4AI unconditionally
    if (results.length > 0) {
        const urlsToScrape = results.map(r => r.url);
        const crawledData = await scrapeUrlsWithCrawl4AI(urlsToScrape);
        if (crawledData) {
            // Replace SearXNG summary with full markdown snippet
            for (const r of results) {
                if (crawledData[r.url]) {
                    // Limit extracted crawler text per page to not overflow context massively
                    const fullText = crawledData[r.url];
                    r.content = fullText.slice(0, 4000) + (fullText.length > 4000 ? '\n...[truncated]' : '');
                }
            }
        }
    }

    // Build text block for system prompt injection
    const contextText = results.length > 0
        ? results.map(r =>
            `[${r.index}] ${r.title}\nURL: ${r.url}\n${r.content}`
        ).join('\n\n')
        : '';

    return { results, contextText };
}

/**
 * Use the LLM to generate optimized search queries from the user's prompt.
 * Falls back to the original text if the LLM call fails.
 * @param {string} text - The user's raw message
 * @returns {Promise<string[]>} Array of search queries
 */
export async function generateSearchQueries(text) {
    // Resolve the active model id (same logic as api.js)
    const selectedModelKey = state.settings.model;
    let modelId = selectedModelKey;
    if (state.models && state.models.length > 0) {
        const modelInfo = state.models.find(m =>
            m.key === selectedModelKey ||
            m.key.endsWith(selectedModelKey) ||
            (m.variants && m.variants.some(v => v.includes(selectedModelKey)))
        );
        if (modelInfo) {
            modelId = modelInfo.key;
            if (modelInfo.loaded_instances && modelInfo.loaded_instances.length > 0) {
                modelId = modelInfo.loaded_instances[0].id;
            }
        }
    }

    try {
        const resp = await secureFetch('/api/generate-queries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: text,
                model: modelId,
                lmUrl: state.settings.serverUrl,
                contextLength: state.settings.contextLength
            })
        });

        if (!resp.ok) return [text];

        const data = await resp.json();
        return data.queries && data.queries.length > 0 ? data.queries : [text];
    } catch (e) {
        console.warn('Query generation failed, using raw text:', e.message);
        return [text];
    }
}

/**
 * Search the web using multiple queries (generated by the LLM) and
 * combine/deduplicate the results.
 * @param {string[]} queries - Array of search queries
 * @returns {Promise<{results: Array, contextText: string}>}
 */
export async function searchWebMultiQuery(queries) {
    const maxResults = state.settings.deepResearcherEnabled
        ? CONFIG.DEEP_RESEARCHER_MAX_RESULTS
        : CONFIG.SEARCH_MAX_RESULTS;

    const allResults = [];
    const seenUrls = new Set();

    for (const query of queries) {
        if (allResults.length >= maxResults) break;

        try {
            const result = await searchWeb(query);
            for (const r of result.results) {
                if (!seenUrls.has(r.url) && allResults.length < maxResults) {
                    seenUrls.add(r.url);
                    allResults.push(r);
                }
            }
        } catch (e) {
            console.warn(`Search failed for query "${query}":`, e.message);
        }
    }

    // Re-index results sequentially
    allResults.forEach((r, i) => { r.index = i + 1; });

    const contextText = allResults.length > 0
        ? allResults.map(r =>
            `[${r.index}] ${r.title}\nURL: ${r.url}\n${r.content}`
        ).join('\n\n')
        : '';

    return { results: allResults, contextText };
}
