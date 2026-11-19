// The pistol: hitscan shots, tracers, muzzle flash, reload.
// Enemy shots come the other way: a tracer from a police car to the player.
import * as THREE from 'three';
import { TUNING } from './config.js';

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.raycaster = new THREE.Raycaster();
    this.ammo = TUNING.pistolMag;
    this.reloading = false;
    this.reloadT = 0;
    this.tracers = [];
    this.sparks = [];
    this.flash = new THREE.PointLight(0xffe9a8, 0, 9);
    scene.add(this.flash);
    this.flashPos = new THREE.Vector3();
  }

  reset() {
    this.ammo = TUNING.pistolMag;
    this.reloading = false;
    this.reloadT = 0;
  }

  reload(G) {
    if (this.reloading || this.ammo === TUNING.pistolMag) return;
    this.reloading = true;
    this.reloadT = TUNING.pistolReload;
    G.audio.reload();
  }

  /** Fire from the camera toward the crosshair. Returns what was hit. */
  fire(G) {
    if (this.reloading || this.ammo <= 0) { if (this.ammo <= 0) this.reload(G); return null; }
    this.ammo -= 1;
    G.audio.shot();
    const cam = G.camera;
    const origin = cam.position.clone();
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    this.raycaster.set(origin, dir);
    this.raycaster.far = TUNING.pistolRange;
    const hits = this.raycaster.intersectObjects(G.shootTargets, true);
    let end = origin.clone().addScaledVector(dir, TUNING.pistolRange);
    let hit = null;
    if (hits.length) {
      const h = hits[0];
      end = h.point.clone();
      hit = this._resolveHit(h, G);
    }
    this._tracer(origin, end);
    this.flash.position.copy(origin).addScaledVector(dir, 1.2);
    this.flash.intensity = 14;
    G.crowd.noteShot(G.player.pos.x, G.player.pos.z);
    G.addHeat(TUNING.heatShoot);
    return hit;
  }

  _resolveHit(h, G) {
    let o = h.object;
    while (o) {
      if (o.userData.ped) {
        G.crowd.killPed(o.userData.ped);
        G.addHeat(TUNING.heatHitPed);
        this._spark(h.point, 0xffd23c);
        return { kind: 'ped' };
      }
      if (o.userData.policeCar) {
        this._spark(h.point, 0x9fd0ff);
        return { kind: 'police' };
      }
      o = o.parent;
    }
    this._spark(h.point, 0xcccccc);
    return { kind: 'world' };
  }

  /** A police car shoots at the player: tracer in, damage decided by the caller. */
  enemyShotFrom(from, to, hit) {
    const a = new THREE.Vector3(from.x, from.y + 1.4, from.z);
    const b = new THREE.Vector3(to.x, to.y + 1.2, to.z);
    if (!hit) {
      // Miss: the shot lands a couple of metres past the player.
      b.x += (Math.random() - 0.5) * 5;
      b.z += (Math.random() - 0.5) * 5;
    }
    this._tracer(a, b, 0xff6a5a);
  }

  _tracer(a, b, color = 0xffe9a8) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, t: 0 });
  }

  _spark(point, color) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true }),
    );
    m.position.copy(point);
    this.scene.add(m);
    this.sparks.push({ mesh: m, t: 0 });
  }

  update(dt) {
    for (const tr of this.tracers) {
      tr.t += dt;
      tr.line.material.opacity = Math.max(0, 0.95 - tr.t * 10);
    }
    while (this.tracers.length && this.tracers[0].t > 0.1) {
      const tr = this.tracers.shift();
      this.scene.remove(tr.line);
      tr.line.geometry.dispose();
      tr.line.material.dispose();
    }
    for (const s of this.sparks) {
      s.t += dt;
      s.mesh.scale.setScalar(1 + s.t * 9);
      s.mesh.material.opacity = Math.max(0, 1 - s.t * 4);
    }
    while (this.sparks.length && this.sparks[0].t > 0.25) {
      const s = this.sparks.shift();
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 220);
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloading = false;
        this.ammo = TUNING.pistolMag;
      }
    }
  }
}
