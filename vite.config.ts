import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { appendFileSync, existsSync, mkdirSync, watch, writeFileSync } from 'node:fs';
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

/**
 * Zonen-Speicher (nur im Dev-Server, Etappe 1, Schritt 6): Der Klötzchen-Editor schickt die Zonendatei an
 * POST /__zone/<name>; sie landet in public/zones/<name>/zone.json, von wo das Spiel sie lädt (auch gebaut, auch auf dem
 * Handy). Ändert sich eine Zonendatei auf der Platte (Speichern, Bearbeiten von Hand, zweite Sitzung), geht das
 * Ereignis tc:zone an alle Clients, die die Zone dann neu laden (Hot-Reload ohne Seitenwechsel; der eigene Wächter von
 * Vite lässt public/zones aus, sonst lüde er die ganze Seite neu).
 */
function zoneStore(): Plugin {
  return {
    name: 'tc-zone-store',
    apply: 'serve',
    configureServer(server) {
      const dir = 'public/zones';
      server.middlewares.use('/__zone', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        const name = (req.url ?? '').replace(/^\/+/, '').split(/[?#]/)[0];
        if (!/^[a-z0-9-]{1,40}$/.test(name)) {
          res.statusCode = 400;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (c: Buffer) => (body += c.toString('utf8')));
        req.on('end', () => {
          try {
            const zone = JSON.parse(body) as { version?: number; name?: string };
            if (zone.version !== 1 || zone.name !== name) throw new Error('keine Zone');
            mkdirSync(`${dir}/${name}`, { recursive: true });
            writeFileSync(`${dir}/${name}/zone.json`, body.endsWith('\n') ? body : body + '\n');
            res.statusCode = 204;
          } catch {
            res.statusCode = 400;
          }
          res.end();
        });
      });
      mkdirSync(dir, { recursive: true });
      if (existsSync(dir)) {
        let timer: NodeJS.Timeout | null = null;
        watch(dir, { recursive: true }, (_event, file) => {
          const m = /^([a-z0-9-]+)[\\/]zone\.json$/.exec(String(file ?? ''));
          if (!m) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => server.ws.send({ type: 'custom', event: 'tc:zone', data: { name: m[1] } }), 80);
        });
      }
    },
  };
}

// base './' sorgt dafür, dass der Build unter jedem Pfad läuft
// (GitHub Pages unter /Traumacoaster/, lokal unter /, später Capacitor file://).
export default defineConfig({
  base: './',
  plugins: [strokeRecorder(), zoneStore()],
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
    // Zonendateien meldet der Zonen-Speicher selbst (tc:zone); Vites Wächter lüde sonst die ganze Seite neu
    watch: { ignored: ['**/public/zones/**'] },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
