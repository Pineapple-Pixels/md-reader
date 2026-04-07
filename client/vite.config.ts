import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: resolve(__dirname),
  build: {
    outDir: resolve(__dirname, '../public'),
    emptyDirBeforeWrite: false,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        entryFileNames: 'js/[name]-[hash].js',
        chunkFileNames: 'js/chunks/[name]-[hash].js',
        assetFileNames: 'css/[name]-[hash][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname),
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3500',
    },
  },
});
