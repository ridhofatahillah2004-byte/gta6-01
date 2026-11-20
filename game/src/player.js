// The player: on foot (walk, run, shoot) and behind the wheel (steal and
// drive). Stealing a car is a crime; shooting is a bigger one. The camera
// lives in main.js — movement here is relative to where it looks.
import { PLAYER, WANTED, CAR } from './config.js';
import { clamp, angleLerp } from './rng.js';
import { makeBox } from './render3d.js';
import { model, multiply, translation } from './mat4.js';
import { stepVehicle, drawVehicle } from './traffic.js';

export function createPlayer(city) {
  const s = city.spawn.player;
  return {
    x: s[0], z: s[1], y: 0,
    yaw: Math.PI,
    health: PLAYER.health,
    onFoot: true,
    car: null,
    walkPhase: 0,
    moving: false,
    flash: 0,
    lastCrimeAt: -100,
  };
}

// The nearest car the player could steal, within maxDist, or null.
export function nearestCar(G, maxDist) {
  let best = null;
  let bestD = maxDist * maxDist;
  const all = [...G.parked, ...G.traffic];
  if (G.missionCar) all.push(G.missionCar);
  for (const v of all) {
    if (v === G.player.car) continue;
    const dx = v.x - G.player.x;
    const dz = v.z - G.player.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) {
      bestD = d2;
      best = v;
    }
  }
  return best;
}

function addWanted(G, amount) {
  G.wanted = clamp(G.wanted + amount, 0, 100);
  G.player.lastCrimeAt = G.time;
}

export function updatePlayer(G, dt) {
  const p = G.player;
  const input = G.input;
  const city = G.city;
  const axes = input.axes();
  p.flash = Math.max(0, p.flash - dt);

  if (input.wasPressed('KeyE')) {
    if (p.onFoot) {
      const car = nearestCar(G, 4.2);
      if (car) {
        // Take the car. A traffic car loses its driver (and its route);
        // a parked one just changes hands. Either way it is theft.
        if (car.kind === 'traffic') {
          car.driver = false;
          car.kind = 'parked';
          G.traffic = G.traffic.filter((v) => v !== car);
        } else {
          G.parked = G.parked.filter((v) => v !== car);
        }
        if (car === G.missionCar) G.missionCar = null;
        p.car = car;
        car.kind = 'player';
        p.onFoot = false;
        p.car.speed = 0;
        addWanted(G, WANTED.stealCar);
        G.hud.toast('Car stolen — the cops noticed (+' + WANTED.stealCar + ' heat)');
        G.audio.pickup();
      }
    } else if (p.car) {
      // Step out on the car's left side.
      const car = p.car;
      const lx = Math.cos(car.yaw);
      const lz = -Math.sin(car.yaw);
      let nx = car.x + lx * 2.6;
      let nz = car.z + lz * 2.6;
      [nx, nz] = city.collide(nx, nz, 0.6);
      p.x = nx;
      p.z = nz;
      p.y = city.groundHeight(nx, nz);
      p.yaw = car.yaw;
      car.kind = 'parked';
      G.parked.push(car);
      p.car = null;
      p.onFoot = true;
    }
  }

  if (p.onFoot) {
    const run = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const camYaw = G.camera.yaw;
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);
    let mx = fx * axes.y + rx * axes.x;
    let mz = fz * axes.y + rz * axes.x;
    const len = Math.hypot(mx, mz);
    p.moving = len > 0.01;
    if (p.moving) {
      mx /= len;
      mz /= len;
      const targetYaw = Math.atan2(mx, mz);
      p.yaw = angleLerp(p.yaw, targetYaw, Math.min(1, dt * 12));
      let nx = p.x + mx * speed * dt;
      let nz = p.z + mz * speed * dt;
      if (!city.blocked(nx, nz)) {
        [nx, nz] = city.collide(nx, nz, PLAYER.radius);
        p.x = nx;
        p.z = nz;
      }
      p.walkPhase += dt * (run ? 13 : 9);
    }
    p.y = city.groundHeight(p.x, p.z);
    // Health comes back slowly while the heat is off.
    if (G.wanted === 0 && p.health < PLAYER.health) p.health = Math.min(PLAYER.health, p.health + 2 * dt);
  } else if (p.car) {
    const car = p.car;
    const throttle = axes.y;
    const steer = -axes.x;
    stepVehicle(car, dt, throttle, steer, city);
    // Ramming a pedestrian is a crime; ramming a police cruiser is worse.
    for (const ped of G.peds) {
      if (ped.dead) continue;
      const dx = ped.x - car.x;
      const dz = ped.z - car.z;
      if (dx * dx + dz * dz < 4.4 && Math.abs(car.speed) > 4) {
        ped.dead = true;
        ped.fallT = 0;
        addWanted(G, WANTED.hitPed);
        G.hud.toast('Pedestrian hit (+' + WANTED.hitPed + ' heat)');
      }
    }
    for (const cop of G.police) {
      const dx = cop.x - car.x;
      const dz = cop.z - car.z;
      if (dx * dx + dz * dz < 9 && Math.abs(car.speed) > 6) {
        addWanted(G, WANTED.hitPolice);
        cop.speed *= 0.4;
        G.hud.shake(0.35);
      }
    }
    p.x = car.x;
    p.z = car.z;
    p.yaw = car.yaw;
    G.audio.engine(Math.abs(car.speed) / CAR.maxSpeed, true);
  } else {
    G.audio.engine(0, false);
  }

  // Shooting: click while on foot. The crosshair is the screen centre.
  const click = input.consumeClick();
  if (click && p.onFoot && G.screen === 'play') {
    shoot(G);
  }
}

function shoot(G) {
  const p = G.player;
  if (G.time - (p.lastShot || -1) < 0.22) return;
  p.lastShot = G.time;
  p.flash = 0.07;
  G.audio.shot();
  const cam = G.camera;
  const dir = [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)];
  const eye = cam.eye;
  let best = null;
  let bestT = 46;
  const test = (x, y, z, radius, ref) => {
    const ox = x - eye[0];
    const oy = y - eye[1];
    const oz = z - eye[2];
    const t = ox * dir[0] + oy * dir[1] + oz * dir[2];
    if (t < 1 || t > bestT) return;
    const px = eye[0] + dir[0] * t;
    const py = eye[1] + dir[1] * t;
    const pz = eye[2] + dir[2] * t;
    const d2 = (x - px) * (x - px) + (y - py) * (y - py) + (z - pz) * (z - pz);
    if (d2 < radius * radius) {
      bestT = t;
      best = ref;
    }
  };
  for (const ped of G.peds) {
    if (!ped.dead) test(ped.x, 1.1, ped.z, 1.3, { type: 'ped', ped });
  }
  for (const cop of G.police) test(cop.x, 1.0, cop.z, 2.2, { type: 'police', cop });
  for (const v of G.traffic) test(v.x, 1.0, v.z, 2.2, { type: 'car', car: v });
  addWanted(G, WANTED.shoot);
  if (!best) return;
  if (best.type === 'ped') {
    best.ped.dead = true;
    best.ped.fallT = 0;
    addWanted(G, WANTED.hitPed);
    G.hud.toast('Pedestrian down (+' + WANTED.hitPed + ' heat)');
    G.money += 20;
    G.hud.toast('+$20 lifted from the scene');
  } else if (best.type === 'police') {
    const cop = best.cop;
    cop.damaged += 1;
    addWanted(G, WANTED.hitPolice);
    if (cop.damaged >= 5) {
      cop.disabled = true;
      cop.speed = 0;
      G.hud.toast('Cruiser disabled!');
    } else {
      G.hud.toast('Hit the cruiser (' + cop.damaged + '/5)');
    }
  } else if (best.type === 'car') {
    const car = best.car;
    if (car.driver) {
      car.driver = false;
      car.speed = 0;
      G.hud.toast('The driver fled the car');
    }
  }
}

const partCache = new Map();
function part(renderer, key, make) {
  if (!partCache.has(key)) partCache.set(key, renderer.mesh(make()));
  return partCache.get(key);
}

// Draw the player on foot: jacket, head, swinging limbs, pistol.
export function drawPlayer(renderer, G, time) {
  const p = G.player;
  if (!p.onFoot) return;
  const swing = p.moving ? Math.sin(p.walkPhase) * 0.55 : 0;
  const base = model(p.x, p.y, p.z, p.yaw, 0);
  const torso = part(renderer, 'p-torso', () => makeBox(0.72, 0.85, 0.42, [0.14, 0.48, 0.52], 0));
  const head = part(renderer, 'p-head', () => makeBox(0.42, 0.42, 0.42, [0.85, 0.65, 0.5], 0));
  const hair = part(renderer, 'p-hair', () => makeBox(0.44, 0.14, 0.44, [0.12, 0.09, 0.07], 0));
  const legL = part(renderer, 'p-leg', () => makeBox(0.26, 0.76, 0.28, [0.16, 0.18, 0.22], 0));
  const armL = part(renderer, 'p-arm', () => makeBox(0.22, 0.68, 0.24, [0.14, 0.48, 0.52], 0));
  const gun = part(renderer, 'p-gun', () => makeBox(0.08, 0.12, 0.42, [0.1, 0.1, 0.11], 0));
  const limb = (ox, oy, oz, pitch) => multiply(multiply(base, model(ox, oy, oz, 0, pitch)), translation(0, -0.36, 0));
  renderer.draw(torso, multiply(base, model(0, 1.18, 0, 0, 0)), {});
  renderer.draw(head, multiply(base, model(0, 1.82, 0, 0, 0)), {});
  renderer.draw(hair, multiply(base, model(0, 2.05, 0, 0, 0)), {});
  renderer.draw(legL, limb(-0.18, 0.78, 0, swing), {});
  renderer.draw(legL, limb(0.18, 0.78, 0, -swing), {});
  renderer.draw(armL, limb(-0.48, 1.55, 0, -swing * 0.8), {});
  renderer.draw(armL, limb(0.48, 1.55, 0, swing * 0.8), {});
  // Pistol in the right hand, pointing where the player faces.
  renderer.draw(gun, multiply(base, model(0.48, 1.2, 0.35, 0, 0)), {});
  if (p.flash > 0) {
    const flash = part(renderer, 'p-flash', () => makeBox(0.3, 0.3, 0.3, [1, 0.85, 0.3], 0));
    renderer.draw(flash, multiply(base, model(0.48, 1.25, 0.62, 0, 0)), { emissive: true });
  }
  // Soft blob shadow under the player.
  const shadow = part(renderer, 'shadow', () => makeBox(1.1, 0.02, 1.1, [0, 0, 0], 0));
  renderer.draw(shadow, model(p.x, p.y + 0.03, p.z, 0, 0), { alpha: 0.3 });
}

export function drawPlayerCar(renderer, G, time) {
  if (G.player.car) drawVehicle(renderer, G.player.car, time);
}
