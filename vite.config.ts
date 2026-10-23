import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: resolve(__dirname, 'src/main/index.ts'),
        vite: {
          build: {
            outDir: 'dist/main',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      {
        entry: resolve(__dirname, 'src/preload/index.ts'),
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: 'dist/preload',
            lib: {
              entry: resolve(__dirname, 'src/preload/index.ts'),
              formats: ['cjs'],
              fileName: () => 'index.js',
            },
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
});
