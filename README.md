# SOLMAR: Streets of Vista Mar

An original 3D open-world crime game for the make.fun **gta6-01** competition —
a browser game in the spirit of GTA 6, built entirely from scratch: the city,
characters, vehicles, story, art, sound and music are all original. Nothing
here comes from Rockstar Games.

## The game

You are **Rook**, back in the seaside city of **Vista Mar** — sun, surf and bad
decisions. Fixer **Mara Voss** has four jobs for you; the Vista Mar PD has long
memories; every car on Ocean Avenue is yours if you are fast enough.

- **A drivable city** — grid streets, a central park and pond, a beach and
  ocean, a pier, a bank, docks, a motel, a garage and a safehouse.
- **On foot and by car** — WASD to walk or drive, Shift to sprint, Space to
  jump or handbrake, mouse to look, E to steal a car (or leave it).
- **Traffic and pedestrians** — AI cars follow the roads and stop behind each
  other; pedestrians stroll the sidewalks and flee when things get loud.
- **Wanted level and police** — crimes raise your heat (0–100, up to 5 stars).
  Patrol cars chase, ram and try to box you in; foot officers shoot. Break
  line of sight and lay low to cool off.
- **Missions and a story** — four jobs: *Hot Wheels* (steal a coupe for the
  garage), *The Drop* (ferry a package to the motel), *Heat Wave* (hit 3 stars,
  then lose them), and *The Big Score* (crack the Vista Mar Bank vault and
  reach the safehouse). Plus 12 cash stashes hidden around the city.
- **Combat** — a hitscan pistol (click to shoot, R to reload, 12-round mag);
  police, pedestrians and cars all take damage, and cars burn and explode.
- **HUD and minimap** — wanted stars, health, cash, ammo, speed, the current
  objective, mission progress bars, toasts, and a live minimap with roads,
  the beach, traffic, flashing police and the gold mission marker.
- **Start and save** — title screen with attract-mode city, pause, game over
  ("WASTED"), story-complete screen, and save/continue in localStorage.
- **Sound** — every effect and the music loop are synthesized live with
  WebAudio: engine, sirens, gunshots, pickups, mission jingles and a bassline.
  No audio files, no network requests.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

WASD move/drive · Shift sprint · Space jump/handbrake · E steal car ·
Click shoot · R reload · P pause · M mute.

Deterministic screenshots: `?shot=start|play|chase|mission&seed=1` stages a
fixed scene (see `shots.json`).

## Tech

- **three.js 0.170.0**, vendored as `game/vendor/three.module.min.js` — the
  only library, loaded from a local file. Everything else is plain
  JavaScript/HTML5, no network requests, no build step.
- Fixed 1/60 s simulation steps; procedural canvas textures for building
  facades, roads, the pier and the ocean; a seeded RNG (`?seed=`) so the city
  and every screenshot are reproducible.

## Layout

- `game/index.html` — page, import map, HUD and menu markup
- `game/styles.css` — HUD and menu styling
- `game/src/main.js` — boot, loop, screens, save/continue
- `game/src/config.js` — tuning and world constants
- `game/src/world.js` — the city: roads, buildings, park, beach, pier, skyline
- `game/src/vehicles.js` — car meshes, arcade driving, traffic AI
- `game/src/pedestrians.js` — sidewalk walkers, panic fleeing
- `game/src/police.js` — wanted level, patrol pursuit, foot officers
- `game/src/combat.js` — hitscan pistol, reload, car damage and explosions
- `game/src/effects.js` — particles, muzzle flashes, smoke, tracers
- `game/src/audio.js` — synthesized WebAudio effects and music
- `game/src/missions.js` — the four-job story, markers, cash stashes
- `game/src/hud.js` — stars, health, cash, objective, toasts, minimap
- `game/src/save.js` — localStorage save/continue
- `game/src/render.js` — renderer, golden-hour sky, follow camera
- `game/src/player.js` — Rook on foot, jumping, stealing cars
- `game/src/input.js` — keyboard + mouse
- `game/src/shots.js` — deterministic screenshot scenes
- `game/src/random.js` — seeded RNG
- `main.ts` — copies `game/` and `screenshots/` to `/output`, writes `dossier.json`

## License

MIT — see `LICENSE`.
