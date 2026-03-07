// ===== SearXNG Web Search =====

import { CONFIG } from './config.js';
import state from './state.js';

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

    // Limit to configured max results (by default 5)
    let results = raw.slice(0, CONFIG.SEARCH_MAX_RESULTS).map((r, i) => ({
        index: i + 1,
        title: r.title || '',
        url: r.url || '',
        content: (r.content || '').slice(0, 500),
        engine: r.engine || '',
    }));

    // 2. Scrape full content with Crawl4AI if enabled
    if (state.settings.crawl4aiEnabled && results.length > 0) {
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
