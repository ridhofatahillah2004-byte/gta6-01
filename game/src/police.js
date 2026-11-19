// The wanted system and the police who answer it: heat rises with crimes,
// stars follow the heat, patrol cars chase the player and officers on foot
// open fire. Heat cools when the player stays clean and out of sight.
import * as THREE from 'three';
import { WANTED, POLICE, WORLD } from './config.js';

function makeOfficerMesh() {
  const group = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1c2f4a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98e6b });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.9, 8), navy);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.75;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 10), new THREE.MeshLambertMaterial({ color: 0x101418 }));
  cap.position.y = 1.95;
  group.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), navy);
  legL.position.set(0.12, 0.35, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), navy);
  legR.position.set(-0.12, 0.35, 0);
  group.add(legR);
  group.userData = { legL, legR };
  return group;
}

export function createPolice(G) {
  const { scene, rng } = G;
  const officers = [];
  let stuckTimer = 0;

  function stars() {
    return G.wanted.stars;
  }

  function addHeat(amount, reason) {
    const w = G.wanted;
    w.heat = Math.min(100, w.heat + amount);
    w.lastCrimeAt = G.time;
    const newStars = Math.min(WANTED.MAX_STARS, Math.floor(w.heat / 20));
    if (newStars > w.stars) {
      w.stars = newStars;
      G.hud.toast(`WANTED — ${w.stars} star${w.stars > 1 ? 's' : ''}! ${reason}`);
      G.audio.sirenBurst();
    }
  }

  function spawnPoliceCar() {
    const road = rng.pick(G.world.roadLines);
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const along = G.player.pos[axis] + rng.range(45, 70) * (rng.chance(0.5) ? 1 : -1);
    const car = G.vehicles.createCar('police', 0x1a1a22, 0, 0, 0);
    car.axis = axis;
    car.dir = 1;
    car.road = road;
    if (axis === 'x') {
      car.pos.set(THREE.MathUtils.clamp(along, -200, 200), 0, road - 2.5);
      car.angle = Math.PI / 2;
    } else {
      car.pos.set(road + 2.5, 0, THREE.MathUtils.clamp(along, -200, 200));
      car.angle = 0;
    }
    car.group.rotation.y = car.angle;
    car.targetSpeed = POLICE.CAR_TOP_SPEED;
    return car;
  }

  function spawnOfficer() {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(18, 30);
    const x = THREE.MathUtils.clamp(G.player.pos.x + Math.cos(a) * d, -210, 210);
    const z = THREE.MathUtils.clamp(G.player.pos.z + Math.sin(a) * d, -210, 210);
    const mesh = makeOfficerMesh();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const officer = { mesh, pos: mesh.position, shootCooldown: rng.range(0.4, 1.2), walkPhase: 0 };
    officers.push(officer);
    return officer;
  }

  function updatePoliceCar(car, dt) {
    const target = G.player.car ? G.player.car.pos : G.player.pos;
    const dx = target.x - car.pos.x;
    const dz = target.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    let diff = desired - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = THREE.MathUtils.clamp(diff, -1.6 * dt, 1.6 * dt);
    car.angle += turn;
    const wantSpeed = dist > 6 ? POLICE.CAR_TOP_SPEED : 0;
    car.speed += Math.max(-20 * dt, Math.min(14 * dt, wantSpeed - car.speed));
    car.pos.x += Math.sin(car.angle) * car.speed * dt;
    car.pos.z += Math.cos(car.angle) * car.speed * dt;
    car.group.rotation.y = car.angle;
    for (const wheel of car.wheels) wheel.rotation.y += (car.speed * dt) / 0.38;
    const before = { x: car.pos.x, z: car.pos.z };
    G.world.resolveCircle(car.pos, 2.2);
    if (Math.hypot(car.pos.x - before.x, car.pos.z - before.z) > 0.01) car.speed *= 0.5;
    // Ram the player's car on contact.
    const pcar = G.player.car;
    if (pcar && dist < 4.4) {
      pcar.speed *= 0.86;
      pcar.health -= 4 * dt * 10;
      if (Math.random() < dt * 4) G.effects.burst(pcar.pos, 0xffc93c, 4);
    }
    // Stuck against a wall: back up for a beat.
    if (Math.abs(car.speed) < 1 && dist > 12) {
      stuckTimer += dt;
      if (stuckTimer > 1.2) {
        car.speed = -8;
        stuckTimer = 0;
      }
    } else {
      stuckTimer = 0;
    }
  }

  function updateOfficers(dt) {
    const playerPos = G.player.pos;
    for (const officer of [...officers]) {
      const dx = playerPos.x - officer.pos.x;
      const dz = playerPos.z - officer.pos.z;
      const dist = Math.hypot(dx, dz);
      officer.pos.x += (dx / (dist || 1)) * 4.6 * dt;
      officer.pos.z += (dz / (dist || 1)) * 4.6 * dt;
      officer.mesh.rotation.y = Math.atan2(dx, dz);
      officer.walkPhase += dt * 9;
      officer.mesh.userData.legL.rotation.x = Math.sin(officer.walkPhase) * 0.5;
      officer.mesh.userData.legR.rotation.x = -Math.sin(officer.walkPhase) * 0.5;
      G.world.resolveCircle(officer.pos, 0.5);
      officer.shootCooldown -= dt;
      if (dist < POLICE.OFFICER_RANGE && officer.shootCooldown <= 0 && !G.player.dead) {
        officer.shootCooldown = POLICE.OFFICER_SHOT_SECONDS;
        G.player.health -= POLICE.OFFICER_DAMAGE;
        G.effects.tracer(officer.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), playerPos.clone().add(new THREE.Vector3(0, 1.2, 0)));
        G.audio.shot(true);
        G.hud.damageFlash();
        if (G.player.health <= 0) G.main.playerDied();
      }
    }
  }

  function update(dt) {
    const w = G.wanted;
    if (G.time - w.lastCrimeAt > WANTED.QUIET_SECONDS && w.heat > 0) {
      w.heat = Math.max(0, w.heat - WANTED.DECAY_PER_SECOND * dt);
      const newStars = Math.floor(w.heat / 20);
      if (newStars < w.stars) {
        w.stars = newStars;
        if (w.stars === 0) G.hud.toast('You lost the cops. Heat is off.');
      }
    }
    // Patrol cars match the star count.
    const policeCars = G.vehicles.cars.filter((c) => c.kind === 'police');
    if (policeCars.length < w.stars) spawnPoliceCar();
    else if (policeCars.length > w.stars) {
      const extra = policeCars[policeCars.length - 1];
      G.vehicles.removeCar(extra);
    }
    // Officers join at two stars and up.
    const wantOfficers = w.stars >= 2 ? Math.min(w.stars, 4) : 0;
    while (officers.length < wantOfficers) spawnOfficer();
    while (officers.length > wantOfficers) {
      const officer = officers.pop();
      scene.remove(officer.mesh);
    }
    updateOfficers(dt);
    G.audio.setSiren(w.stars > 0 && policeCars.length > 0);
  }

  function reset() {
    for (const officer of officers) scene.remove(officer.mesh);
    officers.length = 0;
    for (const car of [...G.vehicles.cars]) {
      if (car.kind === 'police') G.vehicles.removeCar(car);
    }
    G.wanted.stars = 0;
    G.wanted.heat = 0;
  }

  return { officers, stars, addHeat, update, updatePoliceCar, spawnPoliceCar, spawnOfficer, reset };
}
