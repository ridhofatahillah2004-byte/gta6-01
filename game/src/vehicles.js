// Cars: their meshes, arcade driving physics for the player, and the traffic
// AI that cruises the road grid, stops behind other cars and turns at
// intersections. Any car can be stolen with E (traffic drivers just flee).
import * as THREE from 'three';
import { CAR, COLORS, WORLD } from './config.js';

function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14141a });

  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR.LENGTH, 0.85, CAR.WIDTH), paint);
  body.position.y = 0.75;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.65, 1.75), glass);
  cabin.position.set(-0.25, 1.45, 0);
  cabin.castShadow = true;
  group.add(cabin);
  if (isPolice) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 1.7), new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }));
    roof.position.set(-0.25, 1.82, 0);
    group.add(roof);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheels = [];
  for (const [x, z] of [[1.45, 0.95], [1.45, -0.95], [-1.45, 0.95], [-1.45, -0.95]]) {
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.38, z);
    group.add(wheel);
    wheels.push(wheel);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const z of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.4), headMat);
    lamp.position.set(2.22, 0.8, z);
    group.add(lamp);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
  for (const z of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.4), tailMat);
    lamp.position.set(-2.22, 0.8, z);
    group.add(lamp);
  }
  let lightBar = null;
  if (isPolice) {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.7), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.set(-0.25, 1.95, -0.45);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.7), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    blue.position.set(-0.25, 1.95, 0.45);
    lightBar.add(red, blue);
    lightBar.userData = { red, blue };
    group.add(lightBar);
  }
  return { group, wheels, lightBar };
}

export function createVehicles(G) {
  const { scene, rng } = G;
  const cars = [];

  function createCar(kind, color, x, z, angle) {
    const isPolice = kind === 'police';
    const { group, wheels, lightBar } = makeCarMesh(isPolice ? COLORS.policeCar : color, isPolice);
    group.position.set(x, 0, z);
    group.rotation.y = angle;
    scene.add(group);
    const car = {
      kind, group, wheels, lightBar,
      pos: group.position,
      angle,
      speed: 0,
      health: CAR.MAX_HEALTH,
      color,
      axis: 'x',
      dir: 1,
      road: 0,
      lane: 2.5,
      targetSpeed: 0,
      turnCooldown: 0,
      burning: false,
    };
    cars.push(car);
    return car;
  }

  function laneOffset(axis, dir) {
    // Right-hand traffic: offset to the right of the direction of travel.
    if (axis === 'x') return dir > 0 ? -2.5 : 2.5;
    return dir > 0 ? 2.5 : -2.5;
  }

  function spawnTrafficCar() {
    const axis = rng.pick(['x', 'z']);
    const road = rng.pick(G.world.roadLines);
    const dir = rng.chance(0.5) ? 1 : -1;
    const along = rng.range(-190, 190);
    const car = createCar('traffic', rng.pick(COLORS.carPalette), 0, 0, 0);
    car.axis = axis;
    car.dir = dir;
    car.road = road;
    car.lane = laneOffset(axis, dir);
    car.targetSpeed = rng.range(7, CAR.TRAFFIC_SPEED);
    car.speed = car.targetSpeed;
    if (axis === 'x') {
      car.pos.set(along, 0, road + car.lane);
      car.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.pos.set(road + car.lane, 0, along);
      car.angle = dir > 0 ? 0 : Math.PI;
    }
    car.group.rotation.y = car.angle;
    return car;
  }

  function spawnTraffic(count) {
    for (let i = 0; i < count; i += 1) spawnTrafficCar();
  }

  function spawnParked(count) {
    for (let i = 0; i < count; i += 1) {
      const axis = rng.pick(['x', 'z']);
      const road = rng.pick(G.world.roadLines);
      const along = rng.range(-190, 190);
      const dir = rng.chance(0.5) ? 1 : -1;
      const lane = laneOffset(axis, dir) + (dir > 0 ? -2.5 : 2.5) * 0.4;
      const car = createCar('parked', rng.pick(COLORS.carPalette), 0, 0, 0);
      if (axis === 'x') {
        car.pos.set(along, 0, road + lane);
        car.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.pos.set(road + lane, 0, along);
        car.angle = dir > 0 ? 0 : Math.PI;
      }
      car.group.rotation.y = car.angle;
    }
  }

  function carAhead(car) {
    let nearest = null;
    let nearestD = 11;
    for (const other of cars) {
      if (other === car || other.kind === 'parked') continue;
      if (other.axis !== car.axis || other.road !== car.road || other.dir !== car.dir) continue;
      const along = car.axis === 'x' ? other.pos.x - car.pos.x : other.pos.z - car.pos.z;
      const ahead = along * car.dir;
      if (ahead > 0 && ahead < nearestD) {
        nearest = other;
        nearestD = ahead;
      }
    }
    return nearest;
  }

  function updateTraffic(car, dt) {
    const blocked = carAhead(car);
    const want = blocked ? 0 : car.targetSpeed;
    car.speed += Math.max(-CAR.BRAKE * dt, Math.min(CAR.ACCEL * dt, want - car.speed));
    const along = car.axis === 'x' ? car.pos.x : car.pos.z;
    const next = along + car.dir * car.speed * dt;
    // Turn at an intersection sometimes; turn around at the city edge.
    car.turnCooldown -= dt;
    const nearCross = Math.abs(next - Math.round(next / WORLD.STREET_STEP) * WORLD.STREET_STEP) < 1.6;
    if (car.turnCooldown <= 0 && nearCross && rng.chance(0.22)) {
      const newAxis = car.axis === 'x' ? 'z' : 'x';
      const newRoad = G.world.nearestRoadCoord(newAxis === 'x' ? car.pos.z : car.pos.x);
      car.axis = newAxis;
      car.road = newRoad;
      car.dir = rng.chance(0.5) ? 1 : -1;
      car.lane = laneOffset(newAxis, car.dir);
      car.turnCooldown = 4;
      if (newAxis === 'x') {
        car.pos.z = newRoad + car.lane;
        car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.pos.x = newRoad + car.lane;
        car.angle = car.dir > 0 ? 0 : Math.PI;
      }
    }
    if (Math.abs(next) > 205) {
      car.dir *= -1;
      car.lane = laneOffset(car.axis, car.dir);
      car.turnCooldown = 4;
      car.angle += Math.PI;
    }
    if (car.axis === 'x') {
      car.pos.x = next;
      car.pos.z = car.road + car.lane;
    } else {
      car.pos.z = next;
      car.pos.x = car.road + car.lane;
    }
    car.group.rotation.y = car.angle;
    for (const wheel of car.wheels) wheel.rotation.y += (car.speed * dt) / 0.38;
  }

  function collideWithBuildings(car) {
    const before = { x: car.pos.x, z: car.pos.z };
    G.world.resolveCircle(car.pos, CAR.RADIUS);
    const moved = Math.hypot(car.pos.x - before.x, car.pos.z - before.z);
    if (moved > 0.01 && Math.abs(car.speed) > 6) {
      car.health -= Math.abs(car.speed) * 0.6;
      car.speed *= 0.45;
      G.effects.burst(car.pos, 0xffc93c, 8);
      if (car.kind === 'player') G.audio.thud();
    }
    return moved;
  }

  function updatePlayerDriving(dt, input) {
    const car = G.player.car;
    if (!car) return;
    const move = input.move();
    const forward = move.forward;
    const steer = move.strafe;
    if (forward > 0) car.speed += CAR.ACCEL * dt;
    else if (forward < 0) {
      if (car.speed > 0.5) car.speed -= CAR.BRAKE * dt;
      else car.speed -= CAR.ACCEL * 0.6 * dt;
    } else {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
    }
    if (input.jump()) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 22 * dt);
    car.speed = Math.max(-CAR.REVERSE_SPEED, Math.min(CAR.MAX_SPEED, car.speed));
    const steerAmount = steer * CAR.TURN_RATE * dt * Math.min(1, Math.abs(car.speed) / 12 + 0.25);
    car.angle += steerAmount * Math.sign(car.speed || 1);
    car.pos.x += Math.sin(car.angle) * car.speed * dt;
    car.pos.z += Math.cos(car.angle) * car.speed * dt;
    car.group.rotation.y = car.angle;
    for (const wheel of car.wheels) wheel.rotation.y += (car.speed * dt) / 0.38;
    collideWithBuildings(car);
    // Bump traffic cars out of the way.
    for (const other of cars) {
      if (other === car || other.kind === 'parked') continue;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.2 && d > 0.01) {
        other.pos.x += (dx / d) * (4.2 - d) * 0.5;
        other.pos.z += (dz / d) * (4.2 - d) * 0.5;
        if (Math.abs(car.speed) > 8) {
          other.health -= 6;
          car.health -= 2;
          G.effects.burst(other.pos, 0xffc93c, 6);
        }
        car.speed *= 0.82;
      }
    }
    if (car.health <= 0 && !car.burning) {
      car.burning = true;
      G.effects.explosion(car.pos);
      G.audio.explosion();
      G.player.car = null;
      G.player.onFoot = true;
      G.player.pos.set(car.pos.x + 3, 0, car.pos.z + 3);
      car.kind = 'wreck';
      car.speed = 0;
    }
  }

  function nearestCar(pos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      if (car.kind === 'wreck') continue;
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bestD) {
        best = car;
        bestD = d;
      }
    }
    return best;
  }

  function removeCar(car) {
    scene.remove(car.group);
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
  }

  return {
    cars,
    createCar,
    spawnTraffic,
    spawnParked,
    nearestCar,
    removeCar,
    update(dt, input) {
      for (const car of [...cars]) {
        if (car.kind === 'traffic') updateTraffic(car, dt);
        else if (car.kind === 'police') G.police.updatePoliceCar(car, dt, input);
        else if (car.kind === 'player') updatePlayerDriving(dt, input);
        if (car.burning && car.kind !== 'wreck') {
          car.health -= 12 * dt;
          if (Math.random() < dt * 8) G.effects.smoke(car.pos);
          if (car.health <= -40) removeCar(car);
        }
        if (car.lightBar) {
          const on = Math.floor(G.time * 6) % 2 === 0;
          car.lightBar.userData.red.material.color.setHex(on ? 0xff2020 : 0x551010);
          car.lightBar.userData.blue.material.color.setHex(on ? 0x101055 : 0x2040ff);
        }
      }
    },
  };
}
