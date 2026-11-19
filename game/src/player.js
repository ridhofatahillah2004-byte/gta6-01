// Rook on foot: the player mesh, WASD movement relative to the camera,
// jumping, and stealing / leaving cars with E. Stealing any car is a crime.
import * as THREE from 'three';
import { PLAYER, CAR, WANTED } from './config.js';

function makePlayerMesh() {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2e86c1 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98e6b });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.9, 10), shirt);
  body.position.y = 1.08;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.78;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 12), new THREE.MeshLambertMaterial({ color: 0xc0392b }));
  cap.position.y = 2.0;
  group.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.75, 0.18), pants);
  legL.position.set(0.13, 0.38, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.75, 0.18), pants);
  legR.position.set(-0.13, 0.38, 0);
  group.add(legR);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), shirt);
  arm.position.set(0.42, 1.2, 0.25);
  arm.rotation.x = -1.2;
  group.add(arm);
  group.userData = { legL, legR, arm };
  return group;
}

export function createPlayer(G) {
  const mesh = makePlayerMesh();
  mesh.position.set(-20, 0, 20);
  G.scene.add(mesh);
  const player = {
    mesh,
    pos: mesh.position,
    angle: 0,
    vy: 0,
    grounded: true,
    onFoot: true,
    health: PLAYER.MAX_HEALTH,
    cash: PLAYER.START_CASH,
    ammo: PLAYER.MAG_SIZE,
    reloading: 0,
    car: null,
    dead: false,
    walkPhase: 0,
    enterCooldown: 0,
  };

  function updateOnFoot(dt, input) {
    if (player.dead) return;
    player.enterCooldown -= dt;
    const move = input.move();
    const forward = { x: Math.sin(player.angle), z: Math.cos(player.angle) };
    const right = { x: Math.cos(player.angle), z: -Math.sin(player.angle) };
    const speed = input.sprint() ? PLAYER.SPRINT_SPEED : PLAYER.WALK_SPEED;
    let mx = forward.x * move.forward + right.x * move.strafe;
    let mz = forward.z * move.forward + right.z * move.strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len;
      mz /= len;
      player.pos.x += mx * speed * dt;
      player.pos.z += mz * speed * dt;
      player.walkPhase += dt * speed * 2.4;
      mesh.userData.legL.rotation.x = Math.sin(player.walkPhase) * 0.6;
      mesh.userData.legR.rotation.x = -Math.sin(player.walkPhase) * 0.6;
      // Face the direction of travel while moving.
      const targetAngle = Math.atan2(mx, mz);
      let diff = targetAngle - player.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      player.angle += THREE.MathUtils.clamp(diff, -6 * dt, 6 * dt);
    } else {
      mesh.userData.legL.rotation.x *= 0.8;
      mesh.userData.legR.rotation.x *= 0.8;
    }
    mesh.rotation.y = player.angle;
    // Jump + gravity.
    if (input.jump() && player.grounded) {
      player.vy = PLAYER.JUMP_SPEED;
      player.grounded = false;
    }
    if (!player.grounded) {
      player.vy -= 22 * dt;
      player.pos.y += player.vy * dt;
      if (player.pos.y <= 0) {
        player.pos.y = 0;
        player.vy = 0;
        player.grounded = true;
      }
    }
    G.world.resolveCircle(player.pos, PLAYER.RADIUS);
    player.pos.x = THREE.MathUtils.clamp(player.pos.x, -230, 240);
    player.pos.z = THREE.MathUtils.clamp(player.pos.z, -230, 230);
    // Shooting.
    if (input.shootHeld()) G.combat.shoot();
    if (input.reload()) G.combat.startReload();
  }

  function tryEnterCar() {
    if (player.enterCooldown > 0 || player.car) return;
    const car = G.vehicles.nearestCar(player.pos, 4.5);
    if (!car) return;
    const wasTraffic = car.kind === 'traffic';
    car.kind = 'player';
    car.speed = 0;
    player.car = car;
    player.onFoot = false;
    mesh.visible = false;
    player.enterCooldown = 0.6;
    G.player.car = car;
    G.stats.carsStolen += 1;
    G.police.addHeat(WANTED.STEAL_CAR, wasTraffic ? 'carjacked in traffic' : 'car stolen');
    G.hud.toast(wasTraffic ? 'Carjacked! The cops are coming.' : 'Car stolen — keep it quiet.');
    G.audio.click();
  }

  function exitCar() {
    const car = player.car;
    if (!car || Math.abs(car.speed) > 1.5 || player.enterCooldown > 0) return;
    car.kind = 'parked';
    car.speed = 0;
    player.car = null;
    G.player.car = null;
    player.onFoot = true;
    player.pos.set(car.pos.x + 3.2, 0, car.pos.z + 1.5);
    mesh.visible = true;
    player.enterCooldown = 0.6;
    G.audio.click();
  }

  function update(dt, input) {
    if (player.car) {
      if (input.enterCar()) exitCar();
      player.pos.copy(player.car.pos);
    } else {
      updateOnFoot(dt, input);
      if (input.enterCar()) tryEnterCar();
    }
  }

  function reset(x, z, angle) {
    if (player.car) {
      player.car.kind = 'parked';
      player.car.speed = 0;
      player.car = null;
      G.player.car = null;
    }
    player.pos.set(x, 0, z);
    player.angle = angle;
    player.vy = 0;
    player.health = PLAYER.MAX_HEALTH;
    player.ammo = PLAYER.MAG_SIZE;
    player.reloading = 0;
    player.onFoot = true;
    player.dead = false;
    mesh.visible = true;
    mesh.rotation.y = angle;
  }

  player.update = update;
  player.reset = reset;
  player.tryEnterCar = tryEnterCar;
  player.exitCar = exitCar;
  return player;
}
