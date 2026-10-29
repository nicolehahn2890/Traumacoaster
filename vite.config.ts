import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { appendFileSync, existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { networkInterfaces } from 'node:os';

/** erster vorhandener Pfad `name` im Arbeitsordner oder darüber (Worktrees liegen im Haupt-Checkout unter .claude/worktrees) */
function upwards(name: string): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(`${dir}/${name}`)) return `${dir}/${name}`;
    const up = dir.replace(/\/[^/]+$/, '');
    if (!up || up === dir) break;
    dir = up;
  }
  return null;
}

/**
 * Strich-Rekorder (nur im Dev-Server): Das Spiel schickt jeden fertigen Strich (rohe Fingerpunkte, Lesart, Zoom,
 * Ergebnis) an /__strokes; läuft der Server mit TC_RECORD=1, landen sie zeilenweise in recordings/strokes.jsonl. So
 * lassen sich echte Striche vom Handy später nachspielen (npm run strokes:replay).
 */
function strokeRecorder(): Plugin {
  return {
    name: 'tc-stroke-recorder',
    apply: 'serve',
    configureServer(server) {
      // nur mit TC_RECORD=1 aufzeichnen (Florian, 29.10.2026: „Hör mal mit dem Aufnehmen auf … ich nehme erst auf, wenn es
      // so weit ist“); TC_NO_RECORD=1 schaltet weiterhin ab (automatische Tests, damit sie die echten Aufnahmen nicht verfälschen)
      const record = process.env.TC_RECORD === '1' && !process.env.TC_NO_RECORD;
      // in einem Worktree unter .claude/worktrees landen die Striche in der Datei des Haupt-Checkouts, wo das Replay sie sucht
      const file = upwards('recordings/strokes.jsonl') ?? 'recordings/strokes.jsonl';
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
              mkdirSync(file.replace(/\/[^/]+$/, ''), { recursive: true });
              appendFileSync(file, body.replace(/\n/g, ' ') + '\n');
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
      // Adressen im WLAN für den Handy-Link des Zonen-Editors (Stufe 4): IPv4 der Netzwerkkarten, ohne interne
      server.middlewares.use('/__lan', (_req, res) => {
        const ips = Object.values(networkInterfaces())
          .flat()
          .filter((a) => !!a && a.family === 'IPv4' && !a.internal)
          .map((a) => a!.address);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ips }));
      });
      // Bilder zur Zone (Skizzen des Zonen-Editors): POST /__zonefile/<zone>/skizze-<name>.<png|jpg|webp>, höchstens 25 MB
      server.middlewares.use('/__zonefile', (req, res) => {
        const m = /^\/([a-z0-9-]{1,40})\/(skizze-[a-z0-9-]{1,40}\.(?:png|jpe?g|webp))$/.exec((req.url ?? '').split(/[?#]/)[0]);
        if (req.method !== 'POST' || !m) {
          res.statusCode = req.method !== 'POST' ? 405 : 400;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size <= 25e6) chunks.push(c);
        });
        req.on('end', () => {
          if (size > 25e6) {
            res.statusCode = 413;
            res.end();
            return;
          }
          mkdirSync(`${dir}/${m[1]}`, { recursive: true });
          writeFileSync(`${dir}/${m[1]}/${m[2]}`, Buffer.concat(chunks));
          res.statusCode = 204;
          res.end();
        });
      });
      // Zonendateien und ihre Bilder direkt von der Platte (ohne Vites Verzeichnisliste, die public/zones nicht beobachtet):
      // so erscheinen neue Zonen und neu abgelegte Bilder ohne Neustart, und nichts wird zwischengespeichert
      const types: Record<string, string> = { json: 'application/json', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' };
      server.middlewares.use('/zones', (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const rel = decodeURIComponent((req.url ?? '').replace(/^\/+/, '').split(/[?#]/)[0]);
        if (!/^[a-z0-9-]{1,40}\/[\w.-]{1,120}$/.test(rel) || rel.includes('..')) return next();
        const file = `${dir}/${rel}`;
        if (!existsSync(file)) return next();
        const ext = rel.split('.').pop()!.toLowerCase();
        res.setHeader('Content-Type', types[ext] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        res.end(readFileSync(file));
      });
      mkdirSync(dir, { recursive: true });
      if (existsSync(dir)) {
        let timer: NodeJS.Timeout | null = null;
        const watcher = watch(dir, { recursive: true }, (_event, file) => {
          const m = /^([a-z0-9-]+)[\\/]zone\.json$/.exec(String(file ?? ''));
          if (!m) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => server.ws.send({ type: 'custom', event: 'tc:zone', data: { name: m[1] } }), 80);
        });
        // der Wächter hält den Prozess nicht am Leben (Vitest nutzt dieselbe Konfiguration und wartete sonst beim Schließen)
        watcher.unref();
        server.httpServer?.once('close', () => watcher.close());
      }
    },
  };
}

/**
 * HTTPS im WLAN (Zonen-Editor auf dem iPad, docs/ZONENEDITOR-PLAN.md, Entscheidung A7): Safari zählt
 * http://192.168.… nicht als sicheren Kontext, ohne HTTPS fehlen dem Editor Zwischenablage, Teilen und dauerhafter
 * Speicher. Die Zertifikate legt scripts/https-cert.sh im Ordner .certs des Haupt-Checkouts an; die Worktrees unter
 * .claude/worktrees finden ihn, indem sie nach oben suchen.
 */
function certDir(): string | null {
  const dir = upwards('.certs');
  return dir && existsSync(`${dir}/dev.pem`) ? dir : null;
}

/** TC_HTTPS=1 (npm run dev:https): Schlüssel und Zertifikat für den Dev-Server */
function devHttps(): { key: Buffer; cert: Buffer } | undefined {
  if (!process.env.TC_HTTPS) return undefined;
  const dir = certDir();
  if (!dir) throw new Error('Keine Zertifikate gefunden: erst scripts/https-cert.sh ausführen');
  return { key: readFileSync(`${dir}/dev.key`), cert: readFileSync(`${dir}/dev.pem`) };
}

/**
 * Die CA zum Installieren auf dem iPad: /__tc-ca.pem im Dev-Server (mit und ohne HTTPS) liefert rootCA.pem so aus, dass
 * Safari anbietet, sie als Profil zu laden. Nur das öffentliche Zertifikat, nie ein Schlüssel.
 */
function caDownload(): Plugin {
  return {
    name: 'tc-ca-download',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__tc-ca.pem', (_req, res) => {
        const dir = certDir();
        if (!dir || !existsSync(`${dir}/rootCA.pem`)) {
          res.statusCode = 404;
          res.end('Keine CA: erst scripts/https-cert.sh ausführen\n');
          return;
        }
        res.setHeader('Content-Type', 'application/x-x509-ca-cert');
        res.setHeader('Content-Disposition', 'attachment; filename="TraumaCoaster-Dev-CA.pem"');
        res.end(readFileSync(`${dir}/rootCA.pem`));
      });
    },
  };
}

// base './' sorgt dafür, dass der Build unter jedem Pfad läuft
// (GitHub Pages unter /Traumacoaster/, lokal unter /, später Capacitor file://).
export default defineConfig({
  base: './',
  plugins: [strokeRecorder(), zoneStore(), caDownload()],
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
    https: devHttps(),
    // Zonendateien meldet der Zonen-Speicher selbst (tc:zone); Vites Wächter lüde sonst die ganze Seite neu
    watch: { ignored: ['**/public/zones/**'] },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
