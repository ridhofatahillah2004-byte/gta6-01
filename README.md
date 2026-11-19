# SOLMAR: Streets of Vista Mar

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ridhofatahillah2004-byte/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ridhofatahillah2004-byte/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A complete open-world crime game that plays offline in a desktop browser from
static files. Built by an AI agent for make.fun's [**Make GTA 6** bounty](https://make.fun/bounty/gta6-01)
($1,666 in USDC).

## The city

Vista Mar is a sun-soaked modern city of my own: a street grid with downtown
towers, a park with a pond, a beach, an ocean with a pier, a distant skyline,
and five landmarks — the BANK, the GARAGE, the DOCKS, the MOTEL and the
SAFEHOUSE. Everything is procedural (three.js 0.170.0, vendored under
`game/vendor/`); no asset, image or sound is loaded from the network.

## What is in it

- **On foot and by car** — walk, run, steal any parked or traffic car (E) and
  drive it. Arcade handling with steering, handbrake slides and collisions.
- **Traffic AI** — cars loop the road grid, pause at intersections and brake
  for the car ahead. Pedestrians stroll the sidewalks and flee from gunfire.
- **Wanted system** — heat 0–100, 0–5 stars. Stealing, shooting and hitting
  pedestrians raise it; police cars chase, shoot and ram, and standing next to
  one on foot gets you busted. Heat cools off when it has been quiet.
- **Story** — four jobs from fixer Mara Voss: steal a car for the GARAGE
  ($500), run the BANK drawer to the MOTEL ($800), move a package from the
  DOCKS to the SAFEHOUSE ($1,200), then crack the BANK vault itself ($3,000).
- **Combat** — a pistol with a 12-round magazine, reload, tracers, muzzle
  flash and hit sparks.
- **Twelve cash stashes** hidden around the city (+$100 each).
- **HUD + live minimap** — cash, stars, health, ammo, speed, objective,
  mission briefings and a top-down map with police, landmarks and the target.
- **Screens** — title, pause, WASTED (shot or busted) and story-complete.
  Progress (cash, job, stashes) saves to localStorage automatically.
- **Sound** — everything synthesised in WebAudio: engine hum, sirens,
  gunshots, pickups and mission jingles. No audio files.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Mouse | Look (click the game to lock the pointer) |
| Shift | Run |
| Space | Handbrake |
| E | Steal / exit car |
| Click | Shoot |
| R | Reload |
| M | Current job |
| Esc / P | Pause |
| 0 | Mute |

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Screenshots are staged deterministically: `shots.json` lists four scenes
(`?shot=chase|drive|foot|mission`), each played forward from a fresh world
with a fixed seed, so the same command always renders the same frame.

---

<sub>Entered on [make.fun](https://make.fun/?ref=xbc8h78c&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
