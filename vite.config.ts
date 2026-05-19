import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE_PATH || (command === 'build' ? '/xrDocs-xrMPE/' : './'),
}));
