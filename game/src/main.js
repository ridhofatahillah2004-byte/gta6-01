// SOLMAR: Streets of Vista Mar — bootstrap, game loop and camera.
// The whole game state lives in one object G so every module can read it.
import { SEED, PALETTE } from './config.js';
import { makeStream } from './rng.js';
import { model, multiply, translation } from './mat4.js';
import { Renderer } from './render3d.js';
import { buildCity } from './city.js';
import { SoundBank } from './audio.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { createPlayer, updatePlayer, drawPlayer, drawPlayerCar, nearestCar } from './player.js';
import { makeTraffic, makeParked, updateTraffic, drawVehicle } from './traffic.js';
import { makePeds, updatePeds, drawPeds, updatePolice, drawPolice, wantedStars } from './people.js';
import { createMissionState, updateMissions, drawMissions, startMission } from './missions.js';
import { saveGame, loadGame, applySave } from './save.js';
import { applyShot, SHOT_STEPS } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');

const app = document.getElementById('app');
const canvas = document.getElementById('game');
const hudRoot = document.getElementById('hud');

const G = {
  time: 0,
  money: 250,
  wanted: 0,
  screen: 'title',
  busted: false,
  rng: makeStream(SEED),
  traffic: [],
  parked: [],
  peds: [],
  police: [],
  missionCar: null,
  nearCar: null,
  lastCopSpawn: 0,
  saveTimer: 0,
  frozen: false,
  shot: shotName,
  camera: { yaw: Math.PI, pitch: -0.28, dist: 11, eye: [0, 8, 0], target: [0, 1.7, 0] },
};

G.renderer = new Renderer(canvas);
G.city = buildCity(G.renderer);
G.audio = new SoundBank();
G.input = new Input(canvas);
G.hud = new HUD(hudRoot);
G.player = createPlayer(G.city);
G.traffic = makeTraffic(G.city, G.rng, 10);
G.parked = makeParked(G.city, G.rng, 6);
G.peds = makePeds(G.city, G.rng, 24);
G.missions = createMissionState();

// Restore a previous session, if there is one.
const saved = loadGame();
if (saved) applySave(G, saved);

function resize() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  // Renderer.resize sets the drawing buffer and the viewport.
  G.renderer.resize(Math.floor(w * devicePixelRatio), Math.floor(h * devicePixelRatio));
}
window.addEventListener('resize', resize);
resize();

// Start audio on the first interaction (browsers require a gesture).
function unlockAudio() {
  G.audio.unlock();
}
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

function updateCamera(dt) {
  const cam = G.camera;
  const p = G.player;
  const drag = G.input.consumeDrag();
  if (drag.dx !== 0 || drag.dy !== 0) {
    cam.yaw -= drag.dx * 0.005;
    cam.pitch -= drag.dy * 0.004;
    cam.pitch = Math.max(-1.1, Math.min(-0.05, cam.pitch));
    cam.userDragAt = G.time;
  }
  // Drift the camera behind the player while they move.
  if (p.moving || (p.car && Math.abs(p.car.speed) > 2)) {
    if (G.time - (cam.userDragAt || -99) > 2.5) {
      let diff = p.yaw - cam.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cam.yaw += diff * Math.min(1, dt * 1.6);
    }
  }
  const dist = p.onFoot ? 11 : 13.5;
  cam.dist += (dist - cam.dist) * Math.min(1, dt * 3);
  const tx = p.x;
  const ty = p.y + 1.7;
  const tz = p.z;
  const eye = [
    tx - Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
    ty - Math.sin(cam.pitch) * cam.dist,
    tz - Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
  ];
  eye[1] = Math.max(eye[1], 1.2);
  cam.eye = eye;
  cam.target = [tx, ty, tz];
  const shake = G.hud.shakeOffset();
  cam.eye[0] += shake[0];
  cam.eye[1] += shake[1];
}

function step(dt) {
  G.time += dt;
  const p = G.player;
  updatePlayer(G, dt);
  updateTraffic(G, dt);
  updatePeds(G, dt);
  updatePolice(G, dt);
  updateMissions(G, dt);
  // Wanted heat cools off after six quiet seconds.
  if (G.wanted > 0 && G.time - p.lastCrimeAt > 6) {
    G.wanted = Math.max(0, G.wanted - 1.6 * dt);
  }
  G.audio.siren(G.police.length > 0 && G.wanted > 0);
  G.nearCar = p.onFoot ? nearestCar(G, 4.2) : null;
  // Busted or wasted.
  if (G.busted) {
    const fine = Math.min(150, Math.floor(G.money));
    G.money -= fine;
    G.wanted = 0;
    G.police = [];
    G.busted = false;
    p.x = 120;
    p.z = 52;
    p.y = G.city.groundHeight(120, 52);
    if (p.car) {
      p.car.kind = 'parked';
      G.parked.push(p.car);
      p.car = null;
    }
    p.onFoot = true;
    p.health = 100;
    G.screen = 'busted';
    G.hud.setScreen('busted', { fine });
    G.audio.busted();
    saveGame(G);
  }
  if (p.health <= 0) {
    G.money = Math.max(0, G.money - 100);
    G.wanted = 0;
    G.police = [];
    p.health = 100;
    p.x = 120;
    p.z = 52;
    p.y = G.city.groundHeight(120, 52);
    if (p.car) {
      p.car.kind = 'parked';
      G.parked.push(p.car);
      p.car = null;
    }
    p.onFoot = true;
    G.screen = 'wasted';
    G.hud.setScreen('wasted');
    saveGame(G);
  }
  // Autosave every ten seconds.
  G.saveTimer += dt;
  if (G.saveTimer > 10) {
    G.saveTimer = 0;
    saveGame(G);
  }
}

function render() {
  const R = G.renderer;
  const cam = G.camera;
  const aspect = R.canvas.width / Math.max(1, R.canvas.height);
  R.setCamera(cam.eye, cam.target, 60, aspect);
  R.beginFrame(PALETTE.sky);
  const city = G.city;
  for (const d of city.drawables) R.draw(d.mesh, d.model, d.opts || {});
  for (const a of city.animated) {
    if (a.kind === 'beam') {
      // The lighthouse beam sweeps around its lamp room.
      const m = multiply(model(a.pivot[0], a.pivot[1], a.pivot[2], G.time * 0.5, 0), translation(13, 0, 0));
      R.draw(a.mesh, m, a.opts || {});
    } else if (a.kind === 'water') {
      // The ocean scrolls its wave texture.
      R.draw(a.mesh, a.model, { ...(a.opts || {}), uvOffset: [G.time * 0.02, G.time * 0.013] });
    } else {
      R.draw(a.mesh, a.model, a.opts || {});
    }
  }
  for (const v of G.parked) drawVehicle(R, v, G.time);
  for (const v of G.traffic) drawVehicle(R, v, G.time);
  if (G.missionCar) drawVehicle(R, G.missionCar, G.time);
  drawPeds(R, G, G.time);
  drawPolice(R, G, G.time);
  drawMissions(R, G, G.time);
  drawPlayer(R, G, G.time);
  drawPlayerCar(R, G, G.time);
  R.endFrame();
}

function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - (frame.last || t)) / 1000 || 0.016);
  frame.last = t;
  if (G.frozen) {
    render();
    return;
  }
  handleKeys();
  if (G.screen === 'play') {
    step(dt);
  }
  updateCamera(dt);
  G.hud.update(G, dt);
  render();
  G.input.endFrame();
}

function handleKeys() {
  const input = G.input;
  if (input.wasPressed('KeyP')) {
    if (G.screen === 'play') {
      G.screen = 'pause';
      G.hud.setScreen('pause');
    } else if (G.screen === 'pause') {
      G.screen = 'play';
      G.hud.setScreen('play');
    }
  }
  if (input.wasPressed('KeyM')) {
    G.audio.setMuted(!G.audio.muted);
    G.hud.toast(G.audio.muted ? 'Sound off' : 'Sound on');
  }
  if (input.wasPressed('KeyR') && (G.screen === 'busted' || G.screen === 'wasted')) {
    G.screen = 'play';
    G.hud.setScreen('play');
  }
  if (G.screen === 'play' && !G.missions.active) {
    const map = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };
    for (const code of Object.keys(map)) {
      if (input.wasPressed(code)) {
        if (G.missions.done.includes(map[code])) {
          G.hud.toast('That job is already done');
        } else {
          startMission(G, map[code]);
        }
      }
    }
  }
}

// Title screen: click anywhere to start.
canvas.addEventListener('pointerdown', () => {
  if (G.screen === 'title') {
    G.screen = 'play';
    G.hud.setScreen('play');
    G.audio.unlock();
    G.hud.toast('Welcome to Vista Mar. Press 1 to take Mara\u2019s first job.');
  }
});

if (shotName) {
  // Screenshot mode: stage the scene, simulate a fixed window, freeze.
  G.screen = 'play';
  G.hud.setScreen('play');
  applyShot(G, shotName);
  for (let i = 0; i < SHOT_STEPS; i += 1) {
    step(1 / 60);
    updateCamera(1 / 60);
  }
  G.frozen = true;
  G.hud.update(G, 0.016);
  render();
  window.__solmarReady = true;
} else {
  requestAnimationFrame(frame);
}

window.__solmar = G;
