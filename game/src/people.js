// The people of Solmar: pedestrians going about their day, and the police
// who arrive when the heat rises. Pedestrians walk the sidewalks and flee
// a speeding car; cruisers chase the player and bust them on foot.
import { WANTED, CAR } from './config.js';
import { clamp, angleLerp } from './rng.js';
import { makeBox } from './render3d.js';
import { model, multiply } from './mat4.js';
import { createVehicle, stepVehicle, drawVehicle } from './traffic.js';

const SHIRTS = [
  [0.85, 0.3, 0.25], [0.2, 0.5, 0.85], [0.95, 0.8, 0.2], [0.3, 0.7, 0.35],
  [0.6, 0.3, 0.7], [0.9, 0.55, 0.2], [0.75, 0.75, 0.75], [0.15, 0.6, 0.6],
];

export function makePeds(city, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const vertical = rng.chance(0.5);
    const line = city.streets[rng.int(0, city.streets.length - 1)];
    const along = rng.range(-180, 150);
    const off = (rng.chance(0.5) ? 1 : -1) * rng.range(7.5, 9.5);
    const x = vertical ? line + off : along;
    const z = vertical ? along : line + off;
    peds.push({
      x, z, yaw: rng.range(0, Math.PI * 2),
      speed: rng.range(1.2, 2.2),
      color: SHIRTS[rng.int(0, SHIRTS.length - 1)],
      dead: false, fallT: 0, walkPhase: rng.range(0, 6),
      tx: x + rng.range(-40, 40), tz: z + rng.range(-40, 40),
      flee: 0,
    });
  }
  return peds;
}

export function updatePeds(G, dt) {
  const city = G.city;
  const p = G.player;
  for (const ped of G.peds) {
    if (ped.dead) {
      ped.fallT = Math.min(1, ped.fallT + dt * 3);
      continue;
    }
    // Flee a fast car that is about to hit them.
    const car = p.car;
    if (car && Math.abs(car.speed) > 6) {
      const dx = ped.x - car.x;
      const dz = ped.z - car.z;
      if (dx * dx + dz * dz < 64) ped.flee = 1.2;
    }
    ped.flee = Math.max(0, ped.flee - dt);
    const tx = ped.flee > 0 ? ped.x + (ped.x - (car ? car.x : ped.x)) : ped.tx;
    const tz = ped.flee > 0 ? ped.z + (ped.z - (car ? car.z : ped.z)) : ped.tz;
    const dx = tx - ped.x;
    const dz = tz - ped.z;
    const d = Math.hypot(dx, dz);
    if (d < 3) {
      ped.tx = ped.x + G.rng.range(-60, 60);
      ped.tz = ped.z + G.rng.range(-60, 60);
      ped.tx = clamp(ped.tx, -190, 190);
      ped.tz = clamp(ped.tz, -190, 160);
      continue;
    }
    const targetYaw = Math.atan2(dx, dz);
    ped.yaw = angleLerp(ped.yaw, targetYaw, Math.min(1, dt * 6));
    const sp = ped.flee > 0 ? 5 : ped.speed;
    let nx = ped.x + Math.sin(ped.yaw) * sp * dt;
    let nz = ped.z + Math.cos(ped.yaw) * sp * dt;
    if (!city.blocked(nx, nz)) {
      [nx, nz] = city.collide(nx, nz, 0.5);
      ped.x = nx;
      ped.z = nz;
    }
    ped.walkPhase += dt * sp * 3.2;
  }
}

const pedCache = new Map();
function pedPart(renderer, key, make) {
  if (!pedCache.has(key)) pedCache.set(key, renderer.mesh(make()));
  return pedCache.get(key);
}

// A pedestrian is a small figure: legs, torso in a random shirt colour,
// head. Dead ones lie flat on the ground.
export function drawPeds(renderer, G, time) {
  for (const ped of G.peds) {
    const swing = ped.dead ? 0 : Math.sin(ped.walkPhase) * 0.5;
    const pitch = ped.dead ? Math.PI / 2 * ped.fallT : 0;
    const y = ped.dead ? 0.25 : 0;
    const base = model(ped.x, y, ped.z, ped.yaw, pitch);
    const torso = pedPart(renderer, 'ped-torso|' + ped.color.join(','), () => makeBox(0.6, 0.7, 0.36, ped.color, 0));
    const head = pedPart(renderer, 'ped-head', () => makeBox(0.36, 0.36, 0.36, [0.85, 0.65, 0.5], 0));
    const leg = pedPart(renderer, 'ped-leg', () => makeBox(0.22, 0.6, 0.24, [0.18, 0.2, 0.25], 0));
    const at = (ox, oy, oz, p) => multiply(base, model(ox, oy, oz, 0, p || 0));
    renderer.draw(torso, at(0, 0.95, 0, 0), {});
    renderer.draw(head, at(0, 1.5, 0, 0), {});
    renderer.draw(leg, at(-0.16, 0.32, 0, swing), {});
    renderer.draw(leg, at(0.16, 0.32, 0, -swing), {});
  }
}

// --- police ---

export function wantedStars(wanted) {
  // Config: stars are ceil(heat / 20), 0..5.
  if (wanted <= 0) return 0;
  return Math.min(5, Math.ceil(wanted / 20));
}

function spawnCop(G, rng) {
  const p = G.player;
  const angle = rng.range(0, Math.PI * 2);
  const dist = rng.range(45, 70);
  const street = G.city.streets[rng.int(0, G.city.streets.length - 1)];
  const vertical = rng.chance(0.5);
  const x = vertical ? street : p.x + Math.sin(angle) * dist;
  const z = vertical ? p.z + Math.cos(angle) * dist : street;
  const cop = createVehicle(clamp(x, -190, 190), clamp(z, -190, 160), 0, '#f8f9fa', 'police');
  cop.speed = 8;
  return cop;
}

export function updatePolice(G, dt) {
  const p = G.player;
  const stars = wantedStars(G.wanted);
  // Spawn up to the wanted level's cruiser count; despawn when the heat dies.
  if (G.wanted === 0) {
    if (G.police.length > 0 && G.time - p.lastCrimeAt > 12) {
      G.police = G.police.filter((c) => {
        const dx = c.x - p.x;
        const dz = c.z - p.z;
        return dx * dx + dz * dz < 2500;
      });
    }
  } else if (G.police.length < stars && G.time - (G.lastCopSpawn || 0) > 2.5) {
    G.police.push(spawnCop(G, G.rng));
    G.lastCopSpawn = G.time;
  }
  for (const cop of G.police) {
    if (cop.disabled) continue;
    const dx = p.x - cop.x;
    const dz = p.z - cop.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    let diff = desired - cop.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = clamp(diff * 1.8, -1, 1);
    const throttle = dist > 4 ? 1 : 0.4;
    stepVehicle(cop, dt, throttle, steer, G.city);
    // Cruisers get faster with the heat, up to the config's per-star cap.
    const cap = WANTED.policeSpeed[stars] || 15;
    if (cop.speed > cap) cop.speed = cap;
    // Ramming the player on foot hurts; touching them busts the player.
    if (p.onFoot && dist < 2.6) {
      if (G.wanted > 0) {
        G.busted = true;
      } else if (G.time - (cop.lastHit || 0) > 1) {
        cop.lastHit = G.time;
        p.health -= 12;
        G.hud.shake(0.5);
        G.audio.busted();
      }
    }
    // Cops also push traffic out of the way a little.
    for (const v of G.traffic) {
      const vx = v.x - cop.x;
      const vz = v.z - cop.z;
      if (vx * vx + vz * vz < 12) {
        v.x += vx * 0.3;
        v.z += vz * 0.3;
      }
    }
  }
  G.police = G.police.filter((c) => !c.disabled || c.damaged < 8);
}

export function drawPolice(renderer, G, time) {
  for (const cop of G.police) drawVehicle(renderer, cop, time);
}
