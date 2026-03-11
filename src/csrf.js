// ===== CSRF Token Management =====

let _csrfToken = null;

/**
 * Fetch a CSRF token from the server.
 * Tokens are cached and reused for the session.
 */
export async function getCsrfToken() {
    if (_csrfToken) return _csrfToken;
    try {
        const resp = await fetch('/api/csrf-token');
        if (resp.ok) {
            const data = await resp.json();
            _csrfToken = data.token;
            return _csrfToken;
        }
    } catch (e) {
        console.warn('Failed to fetch CSRF token:', e);
    }
    return '';
}

/**
 * Perform a secured fetch that automatically includes the CSRF token.
 * Use this instead of raw fetch() for all POST/PUT/DELETE requests.
 */
export async function secureFetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const token = await getCsrfToken();
        options.headers = {
            ...options.headers,
            'X-CSRF-Token': token,
        };
    }
    return fetch(url, options);
}
