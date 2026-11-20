// Serve SOLMAR locally: `node serve.ts`, then open http://localhost:8080.
// A tiny static server for game/ only — no dependencies, no network, and
// it refuses any path that climbs out of the game folder.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, 'game');
const PORT = 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const rel = normalize(url === '/' ? 'index.html' : url.replace(/^\//, ''));
  const path = join(root, rel);
  if (!path.startsWith(root) || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found: ' + url);
    return;
  }
  const type = TYPES[extname(path).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  res.end(readFileSync(path));
});

server.listen(PORT, () => {
  console.log('SOLMAR is live at http://localhost:' + PORT);
});
