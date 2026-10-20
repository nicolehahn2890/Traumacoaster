import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// base './' sorgt dafür, dass der Build unter jedem Pfad läuft
// (GitHub Pages unter /Traumacoaster/, lokal unter /, später Capacitor file://).
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
  },
  server: {
    port: 5173,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
