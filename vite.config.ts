import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/**
 * Strich-Rekorder (nur im Dev-Server): Das Spiel schickt jeden fertigen Strich (rohe Fingerpunkte, Lesart, Zoom,
 * Ergebnis) an /__strokes; sie landen zeilenweise in recordings/strokes.jsonl. So lassen sich echte Striche vom Handy
 * später nachspielen (npm run strokes:replay).
 */
function strokeRecorder(): Plugin {
  return {
    name: 'tc-stroke-recorder',
    apply: 'serve',
    configureServer(server) {
      // TC_NO_RECORD=1: nichts aufzeichnen (automatische Tests, damit sie die echten Aufnahmen nicht verfälschen)
      const record = !process.env.TC_NO_RECORD;
      server.middlewares.use('/__strokes', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (c: Buffer) => (body += c.toString('utf8')));
        req.on('end', () => {
          try {
            JSON.parse(body);
            if (record) {
              mkdirSync('recordings', { recursive: true });
              appendFileSync('recordings/strokes.jsonl', body.replace(/\n/g, ' ') + '\n');
            }
            res.statusCode = 204;
          } catch {
            res.statusCode = 400;
          }
          res.end();
        });
      });
    },
  };
}

// base './' sorgt dafür, dass der Build unter jedem Pfad läuft
// (GitHub Pages unter /Traumacoaster/, lokal unter /, später Capacitor file://).
export default defineConfig({
  base: './',
  plugins: [strokeRecorder()],
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
