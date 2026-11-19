// SOLMAR: Streets of Vista Mar — boot and the one loop. The game moves
// between title, play, paused, game over and story-complete screens; the
// world advances in fixed 1/60 s steps. ?seed=N fixes the city; ?shot=
// stages a screenshot scene instead of running the loop, paints it twice and
// sets window.__shotReady.
import * as THREE from 'three';
import { STEP, BEST_KEY } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createVehicles } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createSave } from './save.js';
import { createRender } from './render.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_MUTE } from './input.js';
import { createPlayer } from './player.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

// Surface load errors for headless checks: ?shot runs read document.title.
window.addEventListener('error', (event) => {
  document.title = `SOLMAR ERROR: ${event.message}`;
});

const G = {
  time: 0,
  mode: 'title',
  rng: createRandom(seed),
  stats: { carsStolen: 0, playSeconds: 0 },
  missionsDone: [],
  wanted: { stars: 0, heat: 0, lastCrimeAt: -100 },
};

G.render = createRender(G);
G.scene = G.render.scene;
G.camera = G.render.camera;
G.world = createWorld(G);
G.effects = createEffects(G);
G.vehicles = createVehicles(G);
G.peds = createPedestrians(G);
G.police = createPolice(G);
G.combat = createCombat(G);
G.audio = createAudio();
G.missions = createMissions(G);
G.hud = createHud(G);
G.save = createSave();
G.player = createPlayer(G);
G.input = createInput(document.getElementById('game'));

const titleScreen = document.getElementById('title-screen');
const pauseScreen = document.getElementById('pause-screen');
const overScreen = document.getElementById('gameover-screen');
const completeScreen = document.getElementById('complete-screen');
const hudEl = document.getElementById('hud');
const statusEl = document.getElementById('status');

function showScreen(name) {
  for (const [el, key] of [[titleScreen, 'title'], [pauseScreen, 'paused'], [overScreen, 'over'], [completeScreen, 'complete']]) {
    el.classList.toggle('hidden', key !== name);
  }
  hudEl.classList.toggle('hidden', name === 'title');
}

function setMode(mode) {
  G.mode = mode;
  showScreen(mode === 'play' ? '' : mode);
  if (mode === 'play') G.audio.resume();
}

function announce(message) {
  statusEl.textContent = message;
}

function startNewGame() {
  G.save.clear();
  G.missionsDone = [];
  G.stats = { carsStolen: 0, playSeconds: 0 };
  G.player.reset(-20, 20, Math.PI / 2);
  G.player.cash = 250;
  G.missions.reset();
  G.police.reset();
  setMode('play');
  G.audio.startMusic();
  G.hud.centerMessage('VISTA MAR', 'Rook is back in town. Mara is waiting.');
  announce('Playing. Follow the gold marker.');
}

function continueGame() {
  const save = G.save.load();
  if (save) {
    G.player.cash = save.cash ?? 250;
    G.missionsDone = save.missionsDone ?? [];
    G.stats = { carsStolen: save.carsStolen ?? 0, playSeconds: save.playSeconds ?? 0 };
    if (save.missionIndex > 0) G.missions.jumpTo(save.missionIndex);
  }
  G.player.reset(-20, 20, Math.PI / 2);
  G.missions.setObjective();
  setMode('play');
  G.audio.startMusic();
  announce('Continuing. Follow the gold marker.');
}

function playerDied() {
  if (G.player.dead) return;
  G.player.dead = true;
  G.audio.setEngine(false, 0);
  G.audio.setSiren(false);
  G.audio.missionFail();
  G.save.saveGame(G);
  document.getElementById('over-stats').textContent =
    `Cash $${Math.floor(G.player.cash).toLocaleString('en-US')} · Missions ${G.missions.index}/4 · Cars stolen ${G.stats.carsStolen}`;
  setMode('over');
  announce('Wasted. The story ends here — for now.');
}

function showComplete() {
  G.audio.missionComplete();
  G.save.saveGame(G);
  document.getElementById('complete-stats').textContent =
    `Final take $${Math.floor(G.player.cash).toLocaleString('en-US')} · Cars stolen ${G.stats.carsStolen} · Time ${Math.floor(G.stats.playSeconds / 60)} min`;
  setMode('complete');
  announce('Story complete. Vista Mar is yours.');
}

G.main = { playerDied, showComplete };

// Wire the menu buttons.
document.getElementById('btn-start').addEventListener('click', () => {
  G.audio.resume();
  startNewGame();
});
document.getElementById('btn-continue').addEventListener('click', () => {
  G.audio.resume();
  continueGame();
});
document.getElementById('btn-resume').addEventListener('click', () => setMode('play'));
document.getElementById('btn-restart').addEventListener('click', () => startNewGame());
document.getElementById('btn-quit-title').addEventListener('click', () => setMode('title'));
document.getElementById('btn-again').addEventListener('click', () => startNewGame());
document.getElementById('btn-free-roam').addEventListener('click', () => setMode('play'));
document.getElementById('btn-title-2').addEventListener('click', () => setMode('title'));
const continueBtn = document.getElementById('btn-continue');
if (!G.save.load()) continueBtn.classList.add('hidden');
document.getElementById('best-line').textContent = `Best cash: $${(G.save.readBest() || 0).toLocaleString('en-US')}`;

// First population of the living city.
G.vehicles.spawnTraffic(14);
G.vehicles.spawnParked(10);
G.peds.spawn(18);
G.missions.start();

function stepWorld(dt, input) {
  G.time += dt;
  G.stats.playSeconds += dt;
  G.player.update(dt, input);
  G.vehicles.update(dt, input);
  G.peds.update(dt);
  G.police.update(dt);
  G.combat.update(dt);
  G.missions.update(dt);
  G.effects.update(dt);
  G.world.update(dt, G.time);
}

function runShot(name) {
  stageShot(name, G);
  showScreen(G.mode === 'play' ? '' : G.mode);
  // Keep painting every frame: headless screenshots only capture a canvas
  // that was rendered recently, so a one-off paint can come out black.
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    G.render.render();
    painted += 1;
    if (painted === 2) window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  let attractAngle = 0;

  function handleActions() {
    const actions = G.input.takeActions();
    if (actions & ACTION_MUTE) {
      G.audio.setMuted(!G.audio.isMuted());
      G.hud.toast(G.audio.isMuted() ? 'Sound off (M to unmute)' : 'Sound on');
    }
    if (actions & ACTION_CONFIRM) {
      if (G.mode === 'title') startNewGame();
      else if (G.mode === 'over' || G.mode === 'complete') startNewGame();
      else if (G.mode === 'paused') setMode('play');
    } else if (actions & ACTION_PAUSE) {
      if (G.mode === 'play') {
        setMode('paused');
        G.save.saveGame(G);
        announce('Paused. Progress saved.');
      } else if (G.mode === 'paused') setMode('play');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    const look = G.input.lookDelta();
    if (G.mode === 'play') {
      while (accumulator >= STEP) {
        stepWorld(STEP, G.input);
        accumulator -= STEP;
      }
      G.render.updateCamera(STEP, look);
      G.audio.setEngine(!!G.player.car, G.player.car ? Math.abs(G.player.car.speed) / 34 : 0);
    } else if (G.mode === 'title') {
      // Attract mode: traffic rolls on while the camera drifts over the city.
      while (accumulator >= STEP) {
        G.time += STEP;
        G.vehicles.update(STEP, G.input);
        G.peds.update(STEP);
        G.effects.update(STEP);
        G.world.update(STEP, G.time);
        accumulator -= STEP;
      }
      attractAngle += 0.02 * STEP;
      G.render.setCamera(
        Math.cos(attractAngle) * 120, 42, Math.sin(attractAngle) * 120,
        0, 6, 0,
      );
      G.audio.setEngine(false, 0);
    } else {
      accumulator = 0;
      G.audio.setEngine(false, 0);
    }
    if (G.mode === 'play' || G.mode === 'title') G.hud.update();
    G.render.render();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.mode === 'play') {
      setMode('paused');
      G.save.saveGame(G);
    }
  });
  window.addEventListener('keydown', () => G.audio.resume(), { once: true });
  window.addEventListener('mousedown', () => G.audio.resume(), { once: true });

  announce('SOLMAR: Streets of Vista Mar. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
