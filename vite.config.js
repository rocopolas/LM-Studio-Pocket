import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
    plugins: [basicSsl()],
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
            '/api': {
                // Pointing directly to our own separate Node.js Express backend
                target: 'http://127.0.0.1:3000',
                changeOrigin: true,
            }
        },
    },
});
