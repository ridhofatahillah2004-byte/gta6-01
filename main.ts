// SOLMAR's entrypoint for make.fun's gta6-01 bounty (Node 22, stdlib only).
// It hands the game in: copy game/ and screenshots/ beside this file into
// the output directory, then write dossier.json with the kit's library.
// Run it outside the grader as:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// and serve the game itself with `node serve.ts` (http://localhost:8080).
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Pre-flight: the game must have its page, and the screenshots must be
// the four staged renders (3 would also pass, but four show more of it).
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing — the game has no page to serve');
}
const shots = existsSync(join(here, 'screenshots'))
  ? readdirSync(join(here, 'screenshots')).filter((n) => !n.startsWith('.'))
  : [];
if (shots.length < 3 || shots.length > 4) {
  throw new Error('screenshots/ must hold 3 or 4 images, found ' + shots.length);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps: only text_max_bytes shapes the bytes; the rest
// refuse an entry the scorer would refuse, so this fails the same way.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

console.log('SOLMAR handed in: ' + shots.length + ' screenshots, dossier ' + dossier.length + ' bytes -> ' + out);
