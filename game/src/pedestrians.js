// Pedestrians: they stroll the sidewalks, cross at corners, and run when the
// player fires a gun, steals a car or rams through a crowd. Hitting one with
// a car is a crime, so the wanted level answers it.
import * as THREE from 'three';
import { WORLD } from './config.js';

const SHIRTS = [0xd95f4b, 0x4b8ad9, 0x6abf5e, 0xd9b84b, 0x9b59b6, 0xe8e8e8, 0x2c3e50, 0xe67e22];

function makePedMesh(shirt) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98e6b });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.85, 8), shirtMat);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), pantsMat);
  legL.position.set(0.12, 0.35, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), pantsMat);
  legR.position.set(-0.12, 0.35, 0);
  group.add(legR);
  group.userData = { legL, legR };
  return group;
}

export function createPedestrians(G) {
  const { scene, rng } = G;
  const peds = [];

  function randomSidewalkPoint() {
    const road = rng.pick(G.world.roadLines);
    const along = rng.range(-195, 195);
    const side = rng.chance(0.5) ? 7.5 : -7.5;
    if (rng.chance(0.5)) return { x: along, z: road + side };
    return { x: road + side, z: along };
  }

  function spawnPed(x, z) {
    const mesh = makePedMesh(rng.pick(SHIRTS));
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const ped = {
      mesh,
      pos: mesh.position,
      angle: rng.range(0, Math.PI * 2),
      speed: rng.range(1.0, 1.8),
      state: 'walk',
      target: randomSidewalkPoint(),
      health: 100,
      panic: 0,
      walkPhase: rng.range(0, Math.PI * 2),
    };
    peds.push(ped);
    return ped;
  }

  function spawn(count) {
    for (let i = 0; i < count; i += 1) {
      const p = randomSidewalkPoint();
      spawnPed(p.x, p.z);
    }
  }

  function scare(fromPos, radius) {
    for (const ped of peds) {
      const d = Math.hypot(ped.pos.x - fromPos.x, ped.pos.z - fromPos.z);
      if (d < radius) {
        ped.state = 'flee';
        ped.panic = 4;
        ped.target = {
          x: ped.pos.x + (ped.pos.x - fromPos.x) * 2,
          z: ped.pos.z + (ped.pos.z - fromPos.z) * 2,
        };
      }
    }
  }

  function update(dt) {
    const playerPos = G.player.pos;
    for (const ped of [...peds]) {
      if (ped.health <= 0) {
        scene.remove(ped.mesh);
        peds.splice(peds.indexOf(ped), 1);
        continue;
      }
      if (ped.state === 'flee') {
        ped.panic -= dt;
        if (ped.panic <= 0) ped.state = 'walk';
      }
      const dx = ped.target.x - ped.pos.x;
      const dz = ped.target.z - ped.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) {
        if (ped.state === 'flee') {
          ped.state = 'walk';
          ped.target = randomSidewalkPoint();
        } else {
          ped.target = randomSidewalkPoint();
        }
        continue;
      }
      const speed = ped.state === 'flee' ? 5.2 : ped.speed;
      ped.angle = Math.atan2(dx, dz);
      ped.pos.x += (dx / dist) * speed * dt;
      ped.pos.z += (dz / dist) * speed * dt;
      ped.mesh.rotation.y = ped.angle;
      // Simple leg swing so the walk reads.
      ped.walkPhase += dt * speed * 3.2;
      const swing = Math.sin(ped.walkPhase) * 0.45;
      ped.mesh.userData.legL.rotation.x = swing;
      ped.mesh.userData.legR.rotation.x = -swing;
      // Keep them out of buildings.
      G.world.resolveCircle(ped.pos, 0.5);
      // Run over by the player's car: a crime, and the ped goes down.
      const car = G.player.car;
      if (car && Math.abs(car.speed) > 3) {
        const cd = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
        if (cd < 2.4) {
          ped.health = 0;
          G.police.addHeat(25, 'pedestrian down');
          G.effects.burst(ped.pos, 0xff5040, 10);
          G.hud.toast('Pedestrian hit — wanted level up!');
        }
      }
      // A panicking ped too close to the player on foot also counts as a scare.
      void playerPos;
    }
  }

  return { peds, spawn, spawnPed, scare, update };
}
