// Mara Voss's jobs and the twelve cash stashes.
// A mission is a list of stages; each stage points at a place and a verb.
import * as THREE from 'three';
import { MISSIONS, LANDMARKS, STASH_SPOTS, TUNING } from './config.js';

export class MissionSystem {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.mi = 0; // mission index
    this.si = 0; // stage index
    this.holdT = 0;
    this.done = false;
    this.stashes = [];
    this.stashTaken = new Set();
    // Beacon: a pillar of light plus a floating diamond over the target.
    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0xffd23c, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 34, 12, 1, true), pillarMat);
    this.beacon.position.y = 17;
    this.diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: 0xffd23c }),
    );
    this.diamond.position.y = 26;
    scene.add(this.beacon, this.diamond);
    // Cash stashes: small green crates with a glow.
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x2e8a4d, emissive: 0x0a3a1a });
    const lidMat = new THREE.MeshLambertMaterial({ color: 0xd8b25a });
    STASH_SPOTS.forEach(([x, z], i) => {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.1), crateMat);
      box.position.y = 0.4; box.castShadow = true;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 1.2), lidMat);
      lid.position.y = 0.86;
      g.add(box, lid);
      g.position.set(x, 0, z);
      scene.add(g);
      this.stashes.push({ mesh: g, x, z, taken: false, i });
    });
  }

  current() { return this.done ? null : MISSIONS[this.mi]; }

  stage() {
    const m = this.current();
    return m ? m.stages[this.si] : null;
  }

  objectiveText() {
    const m = this.current();
    if (!m) return 'Free roam — Vista Mar is yours. Find stashes, steal cars, stay out of trouble.';
    const s = m.stages[this.si];
    return `${m.title}: ${s.text}`;
  }

  /** World position of the current target, or null when the stage has none. */
  targetPos(G) {
    const s = this.stage();
    if (!s) return null;
    if (s.target) {
      const L = LANDMARKS[s.target];
      return { x: L.x, z: L.z };
    }
    if (s.verb === 'steal') {
      const car = G.vehicles.nearestEnterable(G.player.pos.x, G.player.pos.z, 400);
      return car ? { x: car.mesh.position.x, z: car.mesh.position.z } : null;
    }
    return null;
  }

  reset(save) {
    this.mi = save?.mission ?? 0;
    this.si = 0;
    this.holdT = 0;
    this.done = this.mi >= MISSIONS.length;
    this.stashTaken = new Set(save?.stashes ?? []);
    for (const s of this.stashes) {
      s.taken = this.stashTaken.has(s.i);
      s.mesh.visible = !s.taken;
    }
  }

  update(dt, G) {
    // Beacon follows the target and spins.
    const target = this.targetPos(G);
    if (target && !this.done) {
      this.beacon.visible = true; this.diamond.visible = true;
      this.beacon.position.x = target.x; this.beacon.position.z = target.z;
      this.diamond.position.x = target.x; this.diamond.position.z = target.z;
      this.diamond.position.y = 26 + Math.sin(performance.now() * 0.002) * 1.5;
      this.diamond.rotation.y += dt * 2;
    } else {
      this.beacon.visible = false; this.diamond.visible = false;
    }
    // Stashes.
    for (const s of this.stashes) {
      if (s.taken) continue;
      const d = Math.hypot(G.player.pos.x - s.x, G.player.pos.z - s.z);
      if (d < 2.6) {
        s.taken = true; s.mesh.visible = false;
        this.stashTaken.add(s.i);
        G.addCash(TUNING.stashValue);
        G.audio.pickup();
        G.hud.setPrompt(`Stash found: +$${TUNING.stashValue}`);
      }
    }
    // Mission stages.
    const m = this.current();
    if (!m || G.state !== 'play') return;
    const s = m.stages[this.si];
    if (s.verb === 'steal') {
      if (G.player.inCar) this._advance(G);
      return;
    }
    const L = LANDMARKS[s.target];
    const d = Math.hypot(G.player.pos.x - L.x, G.player.pos.z - L.z);
    if (s.verb === 'goto') {
      if (d < 13) this._advance(G, s);
    } else if (s.verb === 'hold') {
      if (d < 13) {
        this.holdT += dt;
        G.hud.setPrompt(`Hold still… ${Math.ceil(s.seconds - this.holdT)}s`);
        if (this.holdT >= s.seconds) this._advance(G, s);
      } else {
        this.holdT = 0;
      }
    }
  }

  _advance(G, finishedStage) {
    const m = MISSIONS[this.mi];
    if (finishedStage && m.id === 'dockside' && this.si === 0) {
      G.addHeat(TUNING.heatPickup);
      G.hud.setPrompt('Package taken — the harbour police are coming!');
    }
    if (finishedStage && m.id === 'bigscore' && this.si === 1) {
      G.setHeat(TUNING.heatVault);
    }
    this.si += 1;
    this.holdT = 0;
    G.audio.pickup();
    if (this.si >= m.stages.length) {
      G.addCash(m.reward);
      G.audio.missionDone();
      this.mi += 1;
      this.si = 0;
      if (this.mi >= MISSIONS.length) {
        this.done = true;
        G.storyComplete();
      } else {
        const next = MISSIONS[this.mi];
        G.hud.briefing(next.title, `${next.brief}  Reward: $${next.reward}.`);
      }
    }
  }
}
