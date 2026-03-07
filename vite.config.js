import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

// Helper to handle reading and writing JSON files and dynamic proxy
function localBackendPlugin() {
    return {
        name: 'local-backend',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                // 1. Dynamic Proxy for Mixed Content Bypass
                if (req.url.startsWith('/api/proxy/')) {
                    const targetUrl = req.headers['x-target-url'];
                    if (!targetUrl) {
                        res.statusCode = 400;
                        return res.end('Missing X-Target-Url header');
                    }

                    try {
                        // Strip /api/proxy/ prefix to get the actual path
                        const targetPath = req.url.replace(/^\/api\/proxy/, '');
                        const fullUrl = new URL(targetPath, targetUrl).toString();

                        // Prepare fetch options
                        const fetchOptions = {
                            method: req.method,
                            headers: { ...req.headers },
                            // We must remove problematic proxy headers
                            duplex: 'half'
                        };

                        delete fetchOptions.headers['host'];
                        delete fetchOptions.headers['x-target-url'];
                        delete fetchOptions.headers['connection'];
                        delete fetchOptions.headers['origin'];
                        delete fetchOptions.headers['referer'];
                        delete fetchOptions.headers['accept-encoding'];

                        if (req.method !== 'GET' && req.method !== 'HEAD') {
                            // Read body to string/buffer
                            const bodyParts = [];
                            for await (const chunk of req) {
                                bodyParts.push(chunk);
                            }
                            if (bodyParts.length > 0) {
                                fetchOptions.body = Buffer.concat(bodyParts);
                            }
                        }

                        const response = await fetch(fullUrl, fetchOptions);

                        // Copy response headers
                        response.headers.forEach((value, key) => {
                            if (key !== 'content-encoding') {
                                res.setHeader(key, value);
                            }
                        });

                        res.statusCode = response.status;

                        // Pipe response body
                        if (response.body) {
                            const reader = response.body.getReader();
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                res.write(value);
                            }
                        }
                        return res.end();
                    } catch (err) {
                        console.error('Proxy error:', err);
                        res.statusCode = 502;
                        return res.end('Bad Gateway');
                    }
                }

                // 2. Storage API
                if (!req.url.startsWith('/api/storage/')) {
                    return next();
                }

                const dataDir = path.resolve(process.cwd(), 'data');
                if (!fs.existsSync(dataDir)) {
                    fs.mkdirSync(dataDir);
                }

                const isSettings = req.url === '/api/storage/settings';
                const isConversations = req.url === '/api/storage/conversations';

                if (!isSettings && !isConversations) {
                    return next();
                }

                const filePath = path.join(dataDir, isSettings ? 'settings.json' : 'conversations.json');

                if (req.method === 'GET') {
                    if (fs.existsSync(filePath)) {
                        res.setHeader('Content-Type', 'application/json');
                        res.end(fs.readFileSync(filePath));
                    } else {
                        res.setHeader('Content-Type', 'application/json');
                        res.end(isSettings ? '{}' : '[]');
                    }
                    return;
                }

                if (req.method === 'POST') {
                    let body = '';
                    req.on('data', chunk => {
                        body += chunk.toString();
                    });
                    req.on('end', () => {
                        fs.writeFileSync(filePath, body);
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ success: true }));
                    });
                    return;
                }

                next();
            });
        }
    };
}

import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
    plugins: [localBackendPlugin(), basicSsl()],
    server: {
        host: true,
        proxy: {
            '/searxng': {
                target: 'http://127.0.0.1:8080',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/searxng/, ''),
            },
            '/crawl4ai': {
                target: 'http://127.0.0.1:11235',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/crawl4ai/, ''),
            },
        },
    },
});
