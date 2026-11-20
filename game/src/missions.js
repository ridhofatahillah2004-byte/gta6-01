// Missions from Mara Voss, the fixer, plus the 12 hidden cash stashes.
// A mission is a chain of steps from config.js — goto, steal, collect or
// grab — each with a label the HUD shows. Finish the chain and the pay
// lands in the player's pocket. Stashes glow gold until collected.
import { MISSIONS, STASHES, STASH_VALUE } from './config.js';
import { makeBox } from './render3d.js';
import { model, multiply } from './mat4.js';
import { createVehicle } from './traffic.js';

// Drop offsets for a 'collect' step: the drops fan out from the step's
// anchor position, all on open ground in the park.
const COLLECT_OFFSETS = [[0, 0], [45, 10], [-25, 45]];

export function createMissionState() {
  return {
    active: null, // {def, stage, timer, car, drops, timeLeft, progress}
    done: [],
    stash: STASHES.map((s) => ({ name: s.name, x: s.pos[0], z: s.pos[2], taken: false })),
  };
}

function stepPos(step) {
  return [step.pos[0], step.pos[2]];
}

function spawnMissionCar(G, step) {
  const [x, z] = stepPos(step);
  const color = step.car === 'van' ? '#7f8c8d' : '#e74c3c';
  const car = createVehicle(x, z, Math.PI / 2, color, 'mission');
  car.driver = false;
  G.missionCar = car;
  return car;
}

// Start a step: spawn its car, raise the heat, or lay out its drops.
function enterStep(G, act) {
  const step = act.def.steps[act.stage];
  act.timer = 0;
  act.progress = '';
  if (step.kind === 'steal') {
    act.car = spawnMissionCar(G, step);
  }
  if (step.kind === 'collect') {
    const [x, z] = stepPos(step);
    act.drops = COLLECT_OFFSETS.slice(0, step.count || 3).map(([ox, oz]) => ({ x: x + ox, z: z + oz, taken: false }));
    act.timeLeft = step.timeLimit || 240;
    act.progress = '0/' + act.drops.length;
  }
  if (step.wanted) {
    G.wanted = Math.max(G.wanted, step.wanted);
    G.player.lastCrimeAt = G.time;
    G.hud.toast('The heat is on — ' + step.wanted + ' and climbing');
  }
}

export function startMission(G, id) {
  const def = MISSIONS.find((m) => m.id === id);
  if (!def || G.missions.active) return;
  G.missions.active = { def, stage: 0, timer: 0, car: null, drops: null, timeLeft: 0, progress: '' };
  enterStep(G, G.missions.active);
  G.hud.toast('Mission: ' + def.name + ' — ' + def.steps[0].label);
  G.audio.click();
}

export function updateMissions(G, dt) {
  const M = G.missions;
  const p = G.player;
  // Cash stashes: walk or drive over one to pocket it.
  for (const s of M.stash) {
    if (s.taken) continue;
    const dx = p.x - s.x;
    const dz = p.z - s.z;
    if (dx * dx + dz * dz < 12) {
      s.taken = true;
      G.money += STASH_VALUE;
      G.hud.toast(s.name + ': +$' + STASH_VALUE);
      G.audio.pickup();
    }
  }
  const act = M.active;
  if (!act) return;
  const def = act.def;
  const step = def.steps[act.stage];
  const [tx, tz] = stepPos(step);
  const dx = p.x - tx;
  const dz = p.z - tz;
  const dist = Math.hypot(dx, dz);
  let done = false;
  if (step.kind === 'steal') {
    done = p.car === act.car && act.car !== null;
    if (done) G.hud.toast('Got the car — now take it where Mara wants it');
  } else if (step.kind === 'collect') {
    act.timeLeft -= dt;
    let got = 0;
    for (const d of act.drops) {
      if (d.taken) {
        got += 1;
        continue;
      }
      const ddx = p.x - d.x;
      const ddz = p.z - d.z;
      if (ddx * ddx + ddz * ddz < 16) {
        d.taken = true;
        got += 1;
        G.audio.pickup();
        G.hud.toast('Drop collected (' + got + '/' + act.drops.length + ')');
      }
    }
    act.progress = got + '/' + act.drops.length + ' · ' + Math.max(0, Math.ceil(act.timeLeft)) + 's';
    if (got >= act.drops.length) done = true;
    if (act.timeLeft <= 0 && !done) {
      G.hud.toast('Too slow — the trail went cold. The job is off.');
      if (G.missionCar) G.missionCar = null;
      M.active = null;
      return;
    }
  } else if (step.kind === 'grab') {
    if (dist < 7) {
      act.timer += dt;
      act.progress = Math.min(3, act.timer).toFixed(1) + 's';
      if (act.timer >= 3) done = true;
    } else {
      act.timer = 0;
      act.progress = '';
    }
  } else {
    // 'goto': stand on the spot.
    done = dist < 6;
  }
  if (done) {
    act.stage += 1;
    if (act.stage >= def.steps.length) {
      G.money += def.pay;
      M.done.push(def.id);
      G.hud.toast('Mission complete: ' + def.name + ' +$' + def.pay.toLocaleString());
      G.audio.missionDone();
      if (G.missionCar) G.missionCar = null;
      M.active = null;
    } else {
      enterStep(G, act);
      G.hud.toast('Next: ' + def.steps[act.stage].label);
      G.audio.click();
    }
  }
}

// Current objective for the HUD and the 3D beacon, or null.
export function currentObjective(G) {
  const act = G.missions.active;
  if (!act) return null;
  const step = act.def.steps[act.stage];
  return {
    pos: stepPos(step),
    label: step.label,
    mission: act.def,
    progress: act.progress || '',
    drops: act.drops || null,
  };
}

const missionCache = new Map();
function mPart(renderer, key, make) {
  if (!missionCache.has(key)) missionCache.set(key, renderer.mesh(make()));
  return missionCache.get(key);
}

// A cyan beam over the current objective, gold beams over unclaimed
// stashes and uncollected drops, and a pulsing beacon over a mission car.
export function drawMissions(renderer, G, time) {
  const beam = mPart(renderer, 'beam-cyan', () => makeBox(0.5, 30, 0.5, [0.3, 0.85, 1], 0));
  const beamGold = mPart(renderer, 'beam-gold', () => makeBox(0.4, 16, 0.4, [1, 0.8, 0.2], 0));
  const stashBox = mPart(renderer, 'stash-box', () => makeBox(0.7, 0.5, 0.7, [1, 0.8, 0.2], 0));
  const diamond = mPart(renderer, 'diamond', () => makeBox(1.2, 1.2, 1.2, [0.3, 0.85, 1], 0));
  const obj = currentObjective(G);
  if (obj) {
    renderer.draw(beam, model(obj.pos[0], 15, obj.pos[1], 0, 0), { alpha: 0.28, emissive: true });
    renderer.draw(diamond, model(obj.pos[0], 6 + Math.sin(time * 2) * 0.8, obj.pos[1], time * 1.5, 0), { alpha: 0.85, emissive: true });
    if (obj.drops) {
      for (const d of obj.drops) {
        if (d.taken) continue;
        renderer.draw(beamGold, model(d.x, 8, d.z, 0, 0), { alpha: 0.2, emissive: true });
        renderer.draw(stashBox, model(d.x, 0.6, d.z, time * 0.8, 0), { emissive: true });
      }
    }
  }
  for (const s of G.missions.stash) {
    if (s.taken) continue;
    renderer.draw(beamGold, model(s.x, 8, s.z, 0, 0), { alpha: 0.2, emissive: true });
    renderer.draw(stashBox, model(s.x, 0.6, s.z, time * 0.8, 0), { emissive: true });
  }
  if (G.missionCar) {
    const c = G.missionCar;
    renderer.draw(beam, model(c.x, 15, c.z, 0, 0), { alpha: 0.25, emissive: true });
  }
}
