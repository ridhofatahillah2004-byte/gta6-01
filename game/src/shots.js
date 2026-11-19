// Screenshot scenes behind ?shot=chase|drive|foot|mission.
// Each one starts from a fresh world, places the player, cars and police,
// then plays the real rules forward for a few fixed seconds, so the frame
// is what the game really looks like — and the same seed always gives the
// same frame.
import { PARK } from './config.js';

/** Stand-in for the keyboard while a scene plays itself. */
function fakeInput(held) {
  return {
    isDown: (c) => !!held[c],
    pressed: () => false,
    takeMouse: () => ({ x: 0, y: 0 }),
    moveAxes: () => ({ x: 0, y: held.KeyW ? 1 : 0 }),
    endFrame: () => {},
    locked: false,
  };
}

function step(G, n, held) {
  const inp = fakeInput(held);
  for (let i = 0; i < n; i += 1) G.stepWorld(1 / 60, inp);
}

/** Put the player behind the wheel of a parked car, already moving. */
function putPlayerInCar(G, x, z, heading, speed) {
  const V = G.vehicles;
  const car = V.parked.find((c) => !c.taken) || V.parked[0];
  car.mesh.position.set(x, 0, z);
  car.mesh.rotation.y = heading;
  car.heading = heading;
  V.enterCar(car, G.player);
  G.player.inCar.speed = speed;
  G.camYaw = heading + Math.PI;
}

export function stageShot(name, G) {
  G.startFresh();
  if (name === 'chase') {
    // Three stars, three units on the tail, Job 2 on the HUD.
    G.missions.mi = 1; G.missions.si = 0;
    G.setHeat(55);
    putPlayerInCar(G, 22, -22, Math.PI, 22);
    G.vehicles.spawnPolice(22, 8);
    G.vehicles.spawnPolice(17, 26);
    G.vehicles.spawnPolice(27, 30);
    G.camPitch = 0.32;
    step(G, 240, { KeyW: true });
  } else if (name === 'drive') {
    // A fast run east along the beach road, ocean on the right.
    putPlayerInCar(G, -22, 198, Math.PI / 2, 28);
    G.camPitch = 0.3;
    step(G, 180, { KeyW: true });
  } else if (name === 'mission') {
    // The Big Score: vault half-cracked, four stars, units closing in.
    // High diagonal vantage so the BANK facade, the player on its steps and
    // the street all read — the old straight-on camera was a wall of columns.
    G.missions.mi = 3; G.missions.si = 1;
    G.missions.holdT = 6;
    G.setHeat(80);
    G.player.pos.set(44, 0, -33);
    G.player.yaw = Math.PI;
    G.camYaw = 0.6;
    G.camPitch = 0.45;
    G.camDistOverride = 26;
    G.vehicles.spawnPolice(44, 10);
    G.vehicles.spawnPolice(80, -44);
    step(G, 120, {});
  } else {
    // foot: on foot in the park, facing the pond, people strolling by.
    G.player.pos.set(-158, 0, -150);
    G.player.yaw = Math.atan2(PARK.pond.x + 158, PARK.pond.z + 150);
    G.camYaw = G.player.yaw + Math.PI;
    G.camPitch = 0.35;
    G.camDistOverride = 6.5;
    const near = [[-152, -146], [-164, -156], [-150, -158]];
    G.crowd.peds.slice(0, 3).forEach((p, i) => { p.pos.set(near[i][0], 0, near[i][1]); });
    step(G, 120, {});
  }
}
