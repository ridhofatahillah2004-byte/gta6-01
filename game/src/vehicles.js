// Cars: the player's ride, parked cars to steal, traffic, and police.
// One mesh factory, one physics step, one traffic loop each.
import * as THREE from 'three';
import { ROADS, TUNING, SEED } from './config.js';
import { makeRng, clamp, angleDiff } from './rng.js';

const CAR_COLORS = [0xc23b2e, 0x2e6db8, 0xe8b13c, 0x3f8a4d, 0x8a5fc2, 0xd8d8d2, 0x22262b, 0xd86a2e, 0x4dc2c2];

/** A low-poly car: body, cabin, four wheels, headlights, tail lights. */
export function makeCarMesh(color, police = false) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2836 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 4.4), bodyMat);
  body.position.y = 0.65; body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.2), glassMat);
  cabin.position.set(0, 1.3, -0.2); cabin.castShadow = true;
  group.add(body, cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    group.add(w);
    wheels.push(w);
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const s of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lampMat);
    lamp.position.set(s, 0.7, 2.22);
    group.add(lamp);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xc22e2e });
  for (const s of [-0.6, 0.6]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tailMat);
    tail.position.set(s, 0.7, -2.22);
    group.add(tail);
  }
  let lightBar = null;
  if (police) {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.x = -0.4;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    blue.position.x = 0.4;
    lightBar.add(red, blue);
    lightBar.position.set(0, 1.75, -0.2);
    group.add(lightBar);
    group.userData.red = red; group.userData.blue = blue;
  }
  group.userData.wheels = wheels;
  return group;
}

/** Rectangular road loops the traffic follows, one per quadrant. */
function makeLoops() {
  const quads = [[-110, -110], [110, -110], [-110, 110], [110, 110], [-22, -22], [22, 22]];
  return quads.map(([cx, cz]) => {
    const hw = 44, hh = 44;
    return [
      { x: cx - hw, z: cz - hh }, { x: cx + hw, z: cz - hh },
      { x: cx + hw, z: cz + hh }, { x: cx - hw, z: cz + hh },
    ];
  });
}

export class VehicleWorld {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.rng = makeRng(SEED + 7);
    this.traffic = [];
    this.parked = [];
    this.police = [];
    this.playerCar = null; // the car the player is driving, or null
    this.loops = makeLoops();
    this._spawnTraffic();
    this._spawnParked();
  }

  _placeOnRoad(x, z, heading) {
    const mesh = makeCarMesh(this.rng.pick(CAR_COLORS));
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    this.scene.add(mesh);
    return mesh;
  }

  _spawnTraffic() {
    for (let i = 0; i < TUNING.trafficCount; i += 1) {
      const loop = this.loops[i % this.loops.length];
      const wp = i % loop.length;
      const p = loop[wp];
      const mesh = this._placeOnRoad(p.x, p.z, 0);
      this.traffic.push({
        mesh, loop, wp, speed: TUNING.trafficSpeed * this.rng.range(0.85, 1.15),
        heading: 0, pause: 0, kind: 'traffic',
      });
    }
  }

  _spawnParked() {
    const spots = [
      [-22, -30, 0], [66, -15, Math.PI / 2], [-110, 30, 0], [154, -22, Math.PI],
      [22, 120, Math.PI / 2], [-66, -120, 0], [110, 66, Math.PI], [-176, 60, Math.PI / 2],
      [198, 90, 0], [-22, 176, Math.PI / 2], [66, 154, 0], [-110, -176, Math.PI],
    ];
    for (const [x, z, h] of spots) {
      const mesh = this._placeOnRoad(x, z, h);
      this.parked.push({ mesh, pos: mesh.position, heading: h, kind: 'parked', taken: false });
    }
  }

  /** Nearest stealable car (parked or slow traffic) within maxDist of a point. */
  nearestEnterable(x, z, maxDist = 5) {
    let best = null, bestD = maxDist;
    const all = [...this.parked.filter((c) => !c.taken), ...this.traffic];
    for (const c of all) {
      const d = Math.hypot(c.mesh.position.x - x, c.mesh.position.z - z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  enterCar(car, player) {
    car.taken = true;
    this.playerCar = {
      mesh: car.mesh, pos: car.mesh.position, heading: car.heading ?? 0,
      speed: 0, steer: 0, kind: 'player', wasKind: car.kind,
    };
    if (car.kind === 'traffic') this.traffic = this.traffic.filter((t) => t !== car);
    if (car.kind === 'police') this.police = this.police.filter((t) => t !== car);
    player.inCar = this.playerCar;
    return this.playerCar;
  }

  exitCar(player) {
    const car = this.playerCar;
    if (!car) return;
    const side = { x: Math.cos(car.heading) * 2.6, z: -Math.sin(car.heading) * 2.6 };
    player.pos.set(car.pos.x + side.x, 0, car.pos.z + side.z);
    this.city.resolveCircle(player.pos, TUNING.playerRadius);
    if (car.wasKind === 'parked') {
      const entry = this.parked.find((e) => e.mesh === car.mesh);
      if (entry) entry.taken = false;
    } else {
      this.parked.push({ mesh: car.mesh, pos: car.pos, heading: car.heading, kind: 'parked', taken: false });
    }
    this.playerCar = null;
    player.inCar = null;
  }

  spawnPolice(x, z) {
    const mesh = makeCarMesh(0x1a1d22, true);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const car = { mesh, pos: mesh.position, heading: 0, speed: 0, kind: 'police', flash: 0, shootT: 1 };
    this.police.push(car);
    return car;
  }

  removePolice(car) {
    this.scene.remove(car.mesh);
    this.police = this.police.filter((p) => p !== car);
  }

  /** Arcade driving: throttle, steering that bites harder at speed, handbrake slide. */
  updatePlayerCar(dt, input) {
    const car = this.playerCar;
    if (!car) return;
    const fwd = input.isDown('KeyW') || input.isDown('ArrowUp');
    const back = input.isDown('KeyS') || input.isDown('ArrowDown');
    const left = input.isDown('KeyA') || input.isDown('ArrowLeft');
    const right = input.isDown('KeyD') || input.isDown('ArrowRight');
    const brake = input.isDown('Space');
    if (fwd) car.speed += TUNING.carAccel * dt;
    if (back) car.speed -= (car.speed > 0.5 ? TUNING.carBrake : TUNING.carAccel * 0.6) * dt;
    if (!fwd && !back) car.speed -= Math.sign(car.speed) * 6 * dt;
    if (brake) car.speed -= Math.sign(car.speed) * 22 * dt;
    car.speed = clamp(car.speed, -TUNING.carReverseMax, TUNING.carMaxSpeed);
    if (Math.abs(car.speed) < 0.05) car.speed = 0;
    const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
    const grip = brake ? 1.6 : 1;
    car.steer += (steerTarget * TUNING.carSteer * grip - car.steer) * Math.min(1, dt * 8);
    car.heading += car.steer * (car.speed / TUNING.carMaxSpeed) * 2.1 * dt * Math.sign(car.speed || 1);
    const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
    const p = { x: nx, z: nz };
    this.city.resolveCircle(p, 1.7);
    if (p.x !== nx || p.z !== nz) car.speed *= 0.4; // scraped a wall: lose speed
    car.pos.x = p.x; car.pos.z = p.z;
    // Shove traffic cars out of the way.
    for (const other of [...this.traffic, ...this.police]) {
      const dx = other.mesh.position.x - car.pos.x;
      const dz = other.mesh.position.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.4 && d > 0.01) {
        other.mesh.position.x += (dx / d) * (3.4 - d) * 0.7;
        other.mesh.position.z += (dz / d) * (3.4 - d) * 0.7;
      }
    }
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
    car.mesh.rotation.z = -car.steer * 0.06 * Math.sign(car.speed || 1);
    for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2.4;
  }

  updateTraffic(dt) {
    for (const car of this.traffic) {
      if (car.pause > 0) { car.pause -= dt; continue; }
      const target = car.loop[(car.wp + 1) % car.loop.length];
      const dx = target.x - car.mesh.position.x;
      const dz = target.z - car.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3) {
        car.wp = (car.wp + 1) % car.loop.length;
        if (this.rng.chance(0.25)) car.pause = this.rng.range(0.5, 2);
        continue;
      }
      const want = Math.atan2(dx, dz);
      car.heading += clamp(angleDiff(car.heading, want), -1.6 * dt, 1.6 * dt);
      const slow = this._carAhead(car) ? 0.35 : 1;
      const sp = car.speed * slow;
      car.mesh.position.x += Math.sin(car.heading) * sp * dt;
      car.mesh.position.z += Math.cos(car.heading) * sp * dt;
      car.mesh.rotation.y = car.heading;
      for (const w of car.mesh.userData.wheels) w.rotation.x += sp * dt * 2.4;
    }
  }

  _carAhead(car) {
    for (const other of this.traffic) {
      if (other === car) continue;
      const dx = other.mesh.position.x - car.mesh.position.x;
      const dz = other.mesh.position.z - car.mesh.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 9 && d > 0.1) {
        const dot = (dx * Math.sin(car.heading) + dz * Math.cos(car.heading)) / d;
        if (dot > 0.7) return true;
      }
    }
    return false;
  }

  /** Police pursuit: steer at the player, slide around buildings, flash the light bar. */
  updatePolice(dt, target, city) {
    for (const car of this.police) {
      const dx = target.x - car.mesh.position.x;
      const dz = target.z - car.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      // Probe ahead: if a building blocks the way, bias the turn to the clearer side.
      const probe = 10;
      const aheadX = car.mesh.position.x + Math.sin(car.heading) * probe;
      const aheadZ = car.mesh.position.z + Math.cos(car.heading) * probe;
      let bias = 0;
      if (city.circleBlocked(aheadX, aheadZ, 2)) {
        const lx = car.mesh.position.x + Math.sin(car.heading + 0.7) * probe;
        const lz = car.mesh.position.z + Math.cos(car.heading + 0.7) * probe;
        const rx = car.mesh.position.x + Math.sin(car.heading - 0.7) * probe;
        const rz = car.mesh.position.z + Math.cos(car.heading - 0.7) * probe;
        bias = city.circleBlocked(lx, lz, 2) && !city.circleBlocked(rx, rz, 2) ? -1 : 1;
      }
      car.heading += clamp(angleDiff(car.heading, want) + bias * 0.9, -2.2 * dt, 2.2 * dt);
      car.speed += ((dist > 14 ? TUNING.policeSpeed : TUNING.policeSpeed * 0.55) - car.speed) * Math.min(1, dt * 1.5);
      const nx = car.mesh.position.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.mesh.position.z + Math.cos(car.heading) * car.speed * dt;
      const p = { x: nx, z: nz };
      city.resolveCircle(p, 1.7);
      car.mesh.position.x = p.x; car.mesh.position.z = p.z;
      car.mesh.rotation.y = car.heading;
      for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2.4;
      // Flashing light bar.
      car.flash += dt * 6;
      const on = Math.floor(car.flash) % 2 === 0;
      if (car.mesh.userData.red) {
        car.mesh.userData.red.material.color.setHex(on ? 0xff2a2a : 0x550000);
        car.mesh.userData.blue.material.color.setHex(on ? 0x0a1a66 : 0x2a6bff);
      }
    }
  }
}
