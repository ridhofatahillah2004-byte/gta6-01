// Deterministic screenshot scenes (?shot=start|play|chase|mission&seed=1).
// Each one stages the real game — traffic, police, missions, HUD — from a
// fresh state and a fixed number of simulated steps, so the frame is what a
// short session really looks like and the same seed always gives it.
import * as THREE from 'three';
import { STEP } from './config.js';

const FAKE_INPUT = {
  move: () => ({ forward: 1, strafe: 0 }),
  sprint: () => false,
  jump: () => false,
  enterCar: () => false,
  reload: () => false,
  shootHeld: () => false,
  lookDelta: () => ({ yaw: 0, pitch: 0 }),
  takeActions: () => 0,
};

function resetDynamic(G) {
  for (const car of [...G.vehicles.cars]) G.vehicles.removeCar(car);
  for (const ped of [...G.peds.peds]) {
    G.scene.remove(ped.mesh);
    G.peds.peds.splice(G.peds.peds.indexOf(ped), 1);
  }
  G.police.reset();
  G.missions.reset();
  G.wanted.stars = 0;
  G.wanted.heat = 0;
  G.time = 0;
}

function stepWorld(G, steps, input) {
  for (let i = 0; i < steps; i += 1) {
    G.time += STEP;
    G.player.update(STEP, input);
    G.vehicles.update(STEP, input);
    G.peds.update(STEP);
    G.police.update(STEP);
    G.combat.update(STEP);
    G.missions.update(STEP);
    G.effects.update(STEP);
    G.world.update(STEP, G.time);
  }
}

function aimCameraAt(G, from, look) {
  G.render.setCamera(from.x, from.y, from.z, look.x, look.y, look.z);
}

export function stageShot(name, G) {
  resetDynamic(G);
  G.vehicles.spawnTraffic(14);
  G.vehicles.spawnParked(10);
  G.peds.spawn(16);

  if (name === 'play') {
    // Rook driving the red coupe down Ocean Avenue, mission marker ahead.
    const car = G.vehicles.createCar('player', 0xc0392b, -150, -2.5, Math.PI / 2);
    car.speed = 0;
    G.player.car = car;
    G.player.onFoot = false;
    G.player.mesh.visible = false;
    G.player.pos.copy(car.pos);
    G.missions.setObjective();
    stepWorld(G, Math.floor(9 / STEP), FAKE_INPUT);
    const c = G.player.car.pos;
    // Camera trails behind-left but stays on the sidewalk, clear of facades.
    aimCameraAt(G, { x: c.x - 18, y: 7, z: c.z - 5.5 }, { x: c.x + 10, y: 2, z: c.z });
    G.mode = 'play';
    G.hud.update();
    return;
  }

  if (name === 'chase') {
    // Three stars, two patrol cars on Rook's tail. Clear the avenue ahead so
    // the chase actually moves, then place the patrol cars right behind.
    for (const car of [...G.vehicles.cars]) {
      if (car.kind === 'traffic' && Math.abs(car.pos.z) < 6 && car.pos.x > -50 && car.pos.x < 100) {
        G.vehicles.removeCar(car);
      }
    }
    const car = G.vehicles.createCar('player', 0xc0392b, -40, -2.5, Math.PI / 2);
    car.speed = 18;
    G.player.car = car;
    G.player.onFoot = false;
    G.player.mesh.visible = false;
    G.player.pos.copy(car.pos);
    G.wanted.heat = 65;
    G.wanted.stars = 3;
    G.wanted.lastCrimeAt = 0;
    stepWorld(G, Math.floor(3 / STEP), FAKE_INPUT);
    G.effects.burst(new THREE.Vector3(G.player.car.pos.x - 4, 1.5, G.player.car.pos.z), 0x555555, 12);
    const c = car.pos;
    const fwd = { x: Math.sin(car.angle), z: Math.cos(car.angle) };
    const patrol1 = G.police.spawnPoliceCar();
    if (patrol1) {
      patrol1.pos.set(c.x - fwd.x * 12, 0, c.z - fwd.z * 12 + 2.5);
      patrol1.angle = car.angle;
      patrol1.speed = 16;
      patrol1.group.position.copy(patrol1.pos);
      patrol1.group.rotation.y = patrol1.angle;
    }
    const patrol2 = G.police.spawnPoliceCar();
    if (patrol2) {
      patrol2.pos.set(c.x - fwd.x * 20, 0, c.z - fwd.z * 20 - 2.5);
      patrol2.angle = car.angle;
      patrol2.speed = 17;
      patrol2.group.position.copy(patrol2.pos);
      patrol2.group.rotation.y = patrol2.angle;
    }
    // Camera ahead and to the side, looking back: the red coupe in front,
    // the patrol cars closing in behind it.
    aimCameraAt(
      G,
      { x: c.x + fwd.x * 24, y: 7, z: c.z + fwd.z * 24 + 12 },
      { x: c.x - fwd.x * 10, y: 1.5, z: c.z - fwd.z * 10 },
    );
    G.mode = 'play';
    G.hud.update();
    return;
  }

  if (name === 'mission') {
    // On foot at the Vista Mar Bank for the final job, officers closing in.
    // Jump the story to mission 4 so the gold marker sits on the bank.
    G.missions.jumpTo(3);
    G.player.reset(118, -108, Math.PI * 0.87);
    G.wanted.heat = 25;
    G.wanted.stars = 1;
    G.wanted.lastCrimeAt = 0;
    stepWorld(G, Math.floor(2 / STEP), FAKE_INPUT);
    const off1 = G.police.spawnOfficer();
    if (off1) {
      off1.pos.set(132, 0, -112);
      off1.mesh.position.copy(off1.pos);
    }
    const off2 = G.police.spawnOfficer();
    if (off2) {
      off2.pos.set(112, 0, -116);
      off2.mesh.position.copy(off2.pos);
    }
    // Camera on the street south of the bank, looking north at Rook and the
    // BANK sign with the gold mission marker.
    aimCameraAt(G, { x: 108, y: 5.5, z: -94 }, { x: 126, y: 4, z: -122 });
    G.mode = 'play';
    G.hud.update();
    return;
  }

  // Default: the start screen — golden-hour wide shot down Ocean Avenue.
  G.player.reset(-20, 20, Math.PI / 2);
  stepWorld(G, Math.floor(5 / STEP), FAKE_INPUT);
  aimCameraAt(G, { x: -40, y: 26, z: -60 }, { x: 60, y: 4, z: 40 });
  G.mode = 'title';
  G.hud.update();
}
