import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const pkg = (p: string) => path.resolve(__dirname, `../../packages/${p}`);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@aus/ui/tokens.css', replacement: pkg('ui/src/tokens.css') },
      { find: '@aus/ui/ui.css', replacement: pkg('ui/src/ui.css') },
      { find: /^@aus\/ui$/, replacement: pkg('ui/src/index.tsx') },
      { find: '@aus/contracts', replacement: pkg('contracts/src/index.ts') },
      { find: '@aus/commerce-client', replacement: pkg('commerce-client/src/index.ts') },
    ],
  },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  optimizeDeps: {
    exclude: ['@aus/contracts', '@aus/commerce-client', '@aus/ui', '@aus/demo-data'],
  },
});
