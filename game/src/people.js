// The people of Vista Mar: pedestrians who stroll and flee, and the police
// who arrive when the wanted heat rises.
import * as THREE from 'three';
import { ROADS, TUNING, SEED } from './config.js';
import { makeRng, clamp } from './rng.js';

const SHIRTS = [0xd85a5a, 0x5a8fd8, 0x5ad88a, 0xe8b13c, 0x8a5fc2, 0xd8d8d2, 0x2e6db8, 0xc26a8a];

function makePedMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.42, 1.05, 8),
    new THREE.MeshLambertMaterial({ color }),
  );
  body.position.y = 0.85; body.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd8a878 }),
  );
  head.position.y = 1.62; head.castShadow = true;
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x2c3240 }),
  );
  legs.position.y = 0.25;
  g.add(body, head, legs);
  return g;
}

export class Crowd {
  constructor(scene, city, vehicles) {
    this.scene = scene;
    this.city = city;
    this.vehicles = vehicles;
    this.rng = makeRng(SEED + 21);
    this.peds = [];
    this.shotAt = null; // {x, z, t} of the last gunshot, for fleeing
    this.bustedTimer = 0;
    this._spawnPeds();
  }

  _spawnPeds() {
    for (let i = 0; i < TUNING.pedCount; i += 1) {
      const p = this.city.randomSidewalkPoint();
      const mesh = makePedMesh(this.rng.pick(SHIRTS));
      mesh.position.set(p.x, 0, p.z);
      this.scene.add(mesh);
      this.peds.push({
        mesh, pos: mesh.position, heading: this.rng.range(0, Math.PI * 2),
        speed: this.rng.range(1.2, 2), state: 'walk', fleeT: 0, dead: false, deadT: 0,
        walkT: this.rng.range(2, 6),
      });
    }
  }

  /** A gunshot just went off here — pedestrians nearby will run. */
  noteShot(x, z) { this.shotAt = { x, z, t: 0 }; }

  nearestPed(x, z, maxD) {
    let best = null, bestD = maxD;
    for (const p of this.peds) {
      if (p.dead) continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  killPed(ped) {
    if (ped.dead) return;
    ped.dead = true;
    ped.deadT = 0;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.35;
  }

  update(dt, G) {
    const player = G.player;
    if (this.shotAt) {
      this.shotAt.t += dt;
      if (this.shotAt.t > 4) this.shotAt = null;
    }
    for (const p of this.peds) {
      if (p.dead) {
        p.deadT += dt;
        if (p.deadT > 2.5) {
          // Get back up elsewhere: the streets always have people.
          const spot = this.city.randomSidewalkPoint();
          p.pos.set(spot.x, 0, spot.z);
          p.mesh.rotation.x = 0;
          p.dead = false;
        }
        continue;
      }
      // Flee the player when close, or a recent gunshot.
      let threat = null;
      const dp = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
      if (dp < 7) threat = player.pos;
      else if (this.shotAt && Math.hypot(p.pos.x - this.shotAt.x, p.pos.z - this.shotAt.z) < 25) threat = this.shotAt;
      if (threat) { p.state = 'flee'; p.fleeT = 3; }
      else if (p.fleeT > 0) { p.fleeT -= dt; if (p.fleeT <= 0) p.state = 'walk'; }
      if (p.state === 'flee' && threat) {
        const away = Math.atan2(p.pos.x - threat.x, p.pos.z - threat.z);
        p.heading = away;
        p.speed = 7.5;
      } else {
        p.walkT -= dt;
        if (p.walkT <= 0) {
          p.walkT = this.rng.range(2, 6);
          p.heading += this.rng.range(-1.2, 1.2);
        }
        p.speed = 1.6;
      }
      p.pos.x += Math.sin(p.heading) * p.speed * dt;
      p.pos.z += Math.cos(p.heading) * p.speed * dt;
      this.city.resolveCircle(p.pos, 0.5);
      p.mesh.rotation.y = p.heading;
      // Little walking bob.
      p.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.008 + p.pos.x)) * 0.05;
    }
    this._updatePolice(dt, G);
  }

  _spawnPointNear(player, dist) {
    // A road point roughly `dist` away from the player, on the road grid.
    const road = ROADS[Math.floor(this.rng.next() * ROADS.length)];
    const along = this.rng.range(-200, 200);
    const horiz = this.rng.chance(0.5);
    const cand = horiz ? { x: along, z: road } : { x: road, z: along };
    const d = Math.hypot(cand.x - player.pos.x, cand.z - player.pos.z);
    if (d < dist * 0.6 || d > dist * 1.8) {
      // Nudge it toward the wanted ring.
      const a = Math.atan2(cand.x - player.pos.x, cand.z - player.pos.z);
      return { x: player.pos.x + Math.sin(a) * dist, z: player.pos.z + Math.cos(a) * dist };
    }
    return cand;
  }

  _updatePolice(dt, G) {
    const stars = TUNING.starsFor(G.heat);
    const want = stars;
    const have = this.vehicles.police.length;
    if (have < want && G.state === 'play') {
      const spot = this._spawnPointNear(G.player, 62);
      this.vehicles.spawnPolice(spot.x, spot.z);
    } else if (have > want) {
      // Heat fell: the furthest unit gives up and drives off.
      let far = null, farD = 0;
      for (const c of this.vehicles.police) {
        const d = Math.hypot(c.mesh.position.x - G.player.pos.x, c.mesh.position.z - G.player.pos.z);
        if (d > farD) { farD = d; far = c; }
      }
      if (far) this.vehicles.removePolice(far);
    }
    if (this.vehicles.police.length) {
      this.vehicles.updatePolice(dt, G.player.pos, this.city);
      // Shooting: each unit fires on its own timer when in range.
      for (const car of this.vehicles.police) {
        car.shootT -= dt;
        const d = Math.hypot(car.mesh.position.x - G.player.pos.x, car.mesh.position.z - G.player.pos.z);
        if (car.shootT <= 0 && d < TUNING.policeShootRange && G.state === 'play') {
          car.shootT = TUNING.policeShotInterval * (0.8 + this.rng.next() * 0.5);
          const cover = G.player.inCar ? 0.55 : 1;
          const chance = clamp(0.5 - d / 110, 0.08, 0.45) * cover;
          const hit = this.rng.next() < chance;
          G.combat.enemyShotFrom(car.mesh.position, G.player.pos, hit);
          if (hit) {
            G.damagePlayer(TUNING.policeShotDamage, 'shot');
          }
        }
        // Ramming the player on foot: stand on them and it is over.
        if (!G.player.inCar && d < 3.2) {
          this.bustedTimer += dt;
          if (this.bustedTimer >= TUNING.bustedSeconds) {
            this.bustedTimer = 0;
            G.busted();
          }
        }
      }
      if (this.vehicles.police.every((c) => Math.hypot(c.mesh.position.x - G.player.pos.x, c.mesh.position.z - G.player.pos.z) >= 3.2)) {
        this.bustedTimer = 0;
      }
    }
    G.audio.siren(stars > 0 && G.state === 'play');
  }
}
