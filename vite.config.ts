import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE_PATH || (command === 'build' ? '/xrDocs-xrMPE/' : './'),
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/markdown-it/')) {
            return 'markdown';
          }

          if (id.includes('/node_modules/highlight.js/')) {
            return 'highlight';
          }

          return undefined;
        },
      },
    },
  },
}));
