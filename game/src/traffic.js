// Vehicles: one shared arcade model for traffic, parked cars, the
// player's stolen rides and police cruisers. A vehicle is a position, a
// heading and a speed; its body is a set of coloured boxes drawn from a
// small per-colour mesh cache.
import { WORLD, CAR } from './config.js';
import { clamp, angleLerp } from './rng.js';
import { makeBox } from './render3d.js';
import { model, multiply } from './mat4.js';

export const CAR_COLORS = ['#c0392b', '#2980b9', '#f1c40f', '#ecf0f1', '#2c3e50', '#27ae60', '#8e44ad', '#e67e22'];

function hex(rgb) {
  const n = parseInt(rgb.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

const meshCache = new Map();
function partMesh(renderer, key, make) {
  if (!meshCache.has(key)) meshCache.set(key, renderer.mesh(make()));
  return meshCache.get(key);
}

export function createVehicle(x, z, yaw, color, kind) {
  return {
    x, z, yaw, speed: 0,
    color: color || '#c0392b',
    kind: kind || 'traffic',
    steer: 0,
    damaged: 0, // police cruisers smoke at 3, stop at 5
    disabled: false,
    driver: kind === 'traffic',
    ai: null, // traffic AI state, set by makeTraffic
  };
}

// Arcade car physics: throttle -1..1, steer -1..1. Collides with the
// city (buildings, water, bounds) and slides along walls.
export function stepVehicle(v, dt, throttle, steer, city) {
  if (v.disabled) throttle = 0;
  const accel = throttle >= 0 ? CAR.accel : CAR.brake;
  v.speed += throttle * accel * dt;
  v.speed -= v.speed * 0.9 * dt; // drag
  v.speed = clamp(v.speed, -CAR.maxReverse, CAR.maxSpeed);
  if (Math.abs(v.speed) < 0.05 && throttle === 0) v.speed = 0;
  const turn = steer * CAR.steer * (v.speed / CAR.maxSpeed) * (v.speed < 0 ? -1 : 1);
  v.yaw += turn * dt;
  v.steer = steer;
  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  let nx = v.x + fx * v.speed * dt;
  let nz = v.z + fz * v.speed * dt;
  if (city.blocked(nx, nz)) {
    // Bounce off the blocked edge instead of driving into the sea.
    v.speed *= -0.25;
    nx = v.x;
    nz = v.z;
  }
  [nx, nz] = city.collide(nx, nz, 1.7);
  v.x = nx;
  v.z = nz;
}

// Draw one vehicle: body, cabin, four wheels, headlights and taillights.
// Police cruisers get a flashing light bar (red/blue by the clock).
export function drawVehicle(renderer, v, time) {
  const c = hex(v.color);
  const base = model(v.x, 0, v.z, v.yaw, 0);
  const body = partMesh(renderer, 'car-body|' + v.color, () => makeBox(2.0, 1.0, 4.4, c, 0));
  const cabin = partMesh(renderer, 'car-cabin', () => makeBox(1.7, 0.85, 2.2, [0.12, 0.14, 0.18], 0));
  const wheel = partMesh(renderer, 'car-wheel', () => makeBox(0.35, 0.7, 0.7, [0.08, 0.08, 0.09], 0));
  const lightF = partMesh(renderer, 'car-light-f', () => makeBox(0.4, 0.25, 0.15, [1, 0.95, 0.7], 0));
  const lightR = partMesh(renderer, 'car-light-r', () => makeBox(0.4, 0.25, 0.15, [0.9, 0.1, 0.1], 0));
  const at = (ox, oy, oz, yaw) => multiply(base, model(ox, oy, oz, yaw || 0, 0));
  renderer.draw(body, at(0, 0.62, 0), {});
  renderer.draw(cabin, at(0, 1.45, -0.25), {});
  renderer.draw(wheel, at(-0.95, 0.35, 1.45), {});
  renderer.draw(wheel, at(0.95, 0.35, 1.45), {});
  renderer.draw(wheel, at(-0.95, 0.35, -1.45), {});
  renderer.draw(wheel, at(0.95, 0.35, -1.45), {});
  renderer.draw(lightF, at(-0.6, 0.62, 2.22), { emissive: true });
  renderer.draw(lightF, at(0.6, 0.62, 2.22), { emissive: true });
  renderer.draw(lightR, at(-0.6, 0.62, -2.22), { emissive: true });
  renderer.draw(lightR, at(0.6, 0.62, -2.22), { emissive: true });
  if (v.kind === 'police') {
    const phase = Math.floor(time * 2.4) % 2 === 0;
    const barR = partMesh(renderer, 'car-bar-r', () => makeBox(0.7, 0.28, 0.5, [1, 0.08, 0.08], 0));
    const barB = partMesh(renderer, 'car-bar-b', () => makeBox(0.7, 0.28, 0.5, [0.1, 0.2, 1], 0));
    renderer.draw(barR, at(-0.45, 1.95, -0.25), { emissive: true, alpha: phase ? 1 : 0.12 });
    renderer.draw(barB, at(0.45, 1.95, -0.25), { emissive: true, alpha: phase ? 0.12 : 1 });
  }
  if (v.damaged >= 3) {
    // A damaged cruiser smokes: a grey puff above the bonnet.
    const puff = partMesh(renderer, 'car-smoke', () => makeBox(0.9, 0.9, 0.9, [0.55, 0.55, 0.58], 0));
    const bob = Math.sin(time * 6) * 0.2;
    renderer.draw(puff, at(0, 2.1 + bob, 1.2), { alpha: 0.45 });
  }
}

// --- traffic AI ---

// A traffic car drives one street at a time, turns at intersections,
// brakes for whatever is ahead, and turns around at the beachfront.
export function makeTraffic(city, rng, count) {
  const cars = [];
  const streets = city.streets;
  for (let i = 0; i < count; i += 1) {
    const vertical = rng.chance(0.5);
    const line = streets[rng.int(0, streets.length - 1)];
    const along = rng.range(-180, 150);
    const dir = rng.chance(0.5) ? 1 : -1;
    const x = vertical ? line : along;
    const z = vertical ? along : line;
    const yaw = vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const v = createVehicle(x, z, yaw, CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)], 'traffic');
    v.speed = rng.range(7, 11);
    v.ai = { vertical, line, dir, cruise: rng.range(7, 12), turnAt: rng.range(20, 90) };
    cars.push(v);
  }
  return cars;
}

function aheadBlocked(v, others, dist) {
  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  for (const o of others) {
    if (o === v) continue;
    const dx = o.x - v.x;
    const dz = o.z - v.z;
    const along = dx * fx + dz * fz;
    if (along > 0 && along < dist) {
      const side = Math.abs(dx * fz - dz * fx);
      if (side < 2.6) return true;
    }
  }
  return false;
}

export function updateTraffic(G, dt) {
  const city = G.city;
  const all = [...G.traffic, ...G.parked, ...G.police];
  if (G.player.car) all.push(G.player.car);
  for (const v of G.traffic) {
    const ai = v.ai;
    // At an intersection, sometimes turn onto the cross street.
    const nearX = Math.abs(v.x - Math.round(v.x / 40) * 40) < 3;
    const nearZ = Math.abs(v.z - Math.round(v.z / 40) * 40) < 3;
    if (nearX && nearZ && G.rng.chance(dt * 0.5)) {
      ai.vertical = !ai.vertical;
      ai.line = ai.vertical ? Math.round(v.x / 40) * 40 : Math.round(v.z / 40) * 40;
      ai.dir = G.rng.chance(0.5) ? 1 : -1;
      const targetYaw = ai.vertical ? (ai.dir > 0 ? 0 : Math.PI) : (ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      v.yaw = angleLerp(v.yaw, targetYaw, 1);
    }
    // Beachfront turnaround: vertical streets end at the sand.
    if (ai.vertical && v.z > 160) {
      ai.dir = -1;
      v.yaw = Math.PI;
    }
    if (ai.vertical && v.z < -190) {
      ai.dir = 1;
      v.yaw = 0;
    }
    if (!ai.vertical && (v.x > 190 || v.x < -190)) {
      ai.dir = -ai.dir;
      v.yaw = ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    const want = aheadBlocked(v, all, 9) ? 0 : ai.cruise;
    const throttle = v.speed < want ? 0.55 : v.speed > want + 1 ? -0.7 : 0;
    stepVehicle(v, dt, throttle, 0, city);
    // Keep the car glued to its street (the turn above sets the heading).
    if (ai.vertical) v.x += (ai.line - v.x) * Math.min(1, dt * 2);
    else v.z += (ai.line - v.z) * Math.min(1, dt * 2);
  }
  // Gentle separation so cars do not stack on each other.
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      const a = all[i];
      const b = all[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 10.2 && d2 > 0.001) {
        const d = Math.sqrt(d2);
        const push = (3.2 - d) / 2;
        a.x -= (dx / d) * push;
        a.z -= (dz / d) * push;
        b.x += (dx / d) * push;
        b.z += (dz / d) * push;
      }
    }
  }
}

// Parked cars along the road edges, ready to be stolen.
export function makeParked(city, rng, count) {
  const cars = [];
  const spots = city.spawn.cars;
  for (let i = 0; i < count; i += 1) {
    const s = spots[i % spots.length];
    const side = rng.chance(0.5) ? 1 : -1;
    const vertical = rng.chance(0.5);
    const x = vertical ? s[0] + side * 3.4 : s[0];
    const z = vertical ? s[1] : s[1] + side * 3.4;
    const yaw = vertical ? 0 : Math.PI / 2;
    const v = createVehicle(x, z, yaw, CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)], 'parked');
    v.driver = false;
    cars.push(v);
  }
  return cars;
}
