// Combat: the player's pistol. A click fires a hitscan shot from the camera
// through the crosshair; it can wound pedestrians, drop officers, damage cars
// (and blow them up), and chip buildings. Shooting is a crime.
import * as THREE from 'three';
import { PLAYER, WANTED } from './config.js';

export function createCombat(G) {
  const raycaster = new THREE.Raycaster();
  const center = new THREE.Vector2(0, 0);
  let lastShotAt = -10;

  function shoot() {
    const player = G.player;
    if (player.onFoot === false || player.dead || player.reloading > 0) return;
    if (player.ammo <= 0) {
      startReload();
      return;
    }
    if (G.time - lastShotAt < 0.22) return;
    lastShotAt = G.time;
    player.ammo -= 1;
    G.audio.shot(false);
    G.police.addHeat(WANTED.SHOOT, 'shots fired');
    // Muzzle flash at the camera, tracer down the crosshair.
    const origin = G.camera.position.clone();
    const dir = new THREE.Vector3();
    G.camera.getWorldDirection(dir);
    const from = origin.clone().add(dir.clone().multiplyScalar(1.2)).add(new THREE.Vector3(0, -0.25, 0));
    raycaster.setFromCamera(center, G.camera);
    raycaster.far = 90;
    const targets = [];
    for (const ped of G.peds.peds) targets.push(ped.mesh);
    for (const officer of G.police.officers) targets.push(officer.mesh);
    for (const car of G.vehicles.cars) targets.push(car.group);
    const hits = raycaster.intersectObjects(targets, true);
    let end = origin.clone().add(dir.clone().multiplyScalar(90));
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      let object = hit.object;
      while (object.parent && object.parent !== G.scene) object = object.parent;
      // Pedestrian down.
      const ped = G.peds.peds.find((p) => p.mesh === object);
      if (ped) {
        ped.health = 0;
        G.police.addHeat(WANTED.HIT_PED, 'pedestrian down');
        G.effects.burst(end, 0xff5040, 10);
      }
      const officer = G.police.officers.find((o) => o.mesh === object);
      if (officer) {
        G.police.officers.splice(G.police.officers.indexOf(officer), 1);
        G.scene.remove(officer.mesh);
        G.police.addHeat(WANTED.KILL_COP, 'officer down');
        G.effects.burst(end, 0x90a0ff, 12);
        G.player.cash += 25;
        G.hud.toast('Officer down. +$25');
      }
      const car = G.vehicles.cars.find((c) => c.group === object);
      if (car) {
        car.health -= 25;
        G.effects.burst(end, 0xffc93c, 8);
        if (car.health <= 0 && !car.burning) {
          car.burning = true;
          G.effects.explosion(car.pos);
          G.audio.explosion();
        }
      }
      if (!ped && !officer && !car) G.effects.burst(end, 0xd8d8d8, 4);
    }
    G.effects.tracer(from, end);
    G.effects.muzzle(from);
    if (player.ammo === 0) startReload();
  }

  function startReload() {
    const player = G.player;
    if (player.reloading > 0 || player.ammo === PLAYER.MAG_SIZE) return;
    player.reloading = PLAYER.RELOAD_SECONDS;
    G.audio.reload();
  }

  function update(dt) {
    const player = G.player;
    if (player.reloading > 0) {
      player.reloading -= dt;
      if (player.reloading <= 0) {
        player.reloading = 0;
        player.ammo = PLAYER.MAG_SIZE;
      }
    }
  }

  return { shoot, startReload, update };
}
