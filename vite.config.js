import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

// Helper to handle reading and writing JSON files
function localBackendPlugin() {
    return {
        name: 'local-backend',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
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

export default defineConfig({
    plugins: [localBackendPlugin()],
    server: {
        host: true,
        proxy: {
            '/searxng': {
                target: 'http://127.0.0.1:8080',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/searxng/, ''),
            },
        },
    },
});
