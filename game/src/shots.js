// Screenshot staging: `?shot=start|drive|chase|mission` places the game in
// a fixed, interesting state and then advances the simulation a fixed
// number of steps at a fixed dt, so the captured frame is reproducible.
// This is how the four screenshots for the entry are taken.
import { createVehicle } from './traffic.js';
import { startMission } from './missions.js';

export const SHOT_STEPS = 90; // 1.5 seconds at 60fps, then freeze

export function applyShot(G, name) {
  const p = G.player;
  if (name === 'start') {
    // Default spawn, camera looking north up the avenue toward the skyline.
    G.camera.yaw = Math.PI;
    G.camera.pitch = -0.2;
    G.camera.dist = 11;
    return;
  }
  if (name === 'drive') {
    // The player in a red coupe, cruising down the main avenue.
    const car = createVehicle(0, -60, 0, '#c0392b', 'player');
    G.parked = G.parked.filter((v) => v !== car);
    p.car = car;
    p.onFoot = false;
    car.speed = 15;
    G.camera.yaw = 0;
    G.camera.pitch = -0.18;
    G.camera.dist = 13;
    return;
  }
  if (name === 'chase') {
    // Three stars, two cruisers closing in on a getaway car racing south
    // down the avenue — the whole chase reads in one frame.
    const car = createVehicle(40, -60, 0, '#2c3e50', 'player');
    p.car = car;
    p.onFoot = false;
    car.speed = 17;
    G.wanted = 55;
    p.lastCrimeAt = G.time;
    for (let i = 0; i < 2; i += 1) {
      const cop = createVehicle(i === 0 ? 36 : 44, -80 - i * 8, 0, '#f8f9fa', 'police');
      cop.speed = 15;
      G.police.push(cop);
    }
    G.camera.yaw = 0;
    G.camera.pitch = -0.22;
    G.camera.dist = 14;
    return;
  }
  if (name === 'mission') {
    // Mara's first job: the package waits at the docks, beacon overhead.
    // The player stands on the west avenue so the warehouse, the beacon
    // and the player all read in one frame, with no building in between.
    startMission(G, 0);
    p.x = -160;
    p.z = 130;
    p.y = G.city.groundHeight(p.x, p.z);
    p.yaw = 0.9; // facing south-east, toward the docks warehouse
    G.camera.yaw = 0.9;
    G.camera.pitch = -0.28;
    G.camera.dist = 14;
    return;
  }
  // Unknown shot name: fall back to the start frame.
  G.camera.yaw = Math.PI;
  G.camera.pitch = -0.2;
  G.camera.dist = 11;
}
