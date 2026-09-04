import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The config is ESM ("type": "module"), so `__dirname` does not exist here.
const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * The dev server proxies `/api` to the Express process. That indirection is the
 * reason no API key is ever bundled: the browser has no provider URLs and no
 * secrets, only our own endpoints.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Single source of truth for module metadata, shared with the server.
      '@shared': path.resolve(rootDir, '../shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
    fs: {
      // Allow importing from ../shared during dev.
      allow: [path.resolve(rootDir, '..')],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
