// The story: four jobs for fixer Mara Voss, from a stolen car to the bank
// vault, plus cash stashes hidden around the city. Each mission is steps with
// a glowing marker, an objective line and a payout; finishing all four
// completes the story.
import * as THREE from 'three';
import { WANTED } from './config.js';

const MISSION_LIST = [
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    briefing: 'Mara needs wheels. Steal any car and bring it to the garage.',
    reward: 500,
    steps: [
      { type: 'steal', text: 'Steal a car (walk up to one and press E)' },
      { type: 'deliver-car', target: 'garage', text: 'Drive the car to the garage' },
    ],
  },
  {
    id: 'the-drop',
    title: 'The Drop',
    briefing: 'A package is waiting at the docks. Pick it up and take it to the motel. The docks are watched — expect heat.',
    reward: 800,
    steps: [
      { type: 'pickup', target: 'docks', text: 'Pick up the package at the docks', onDone: 'heat' },
      { type: 'deliver', target: 'motel', text: 'Deliver the package to the motel' },
    ],
  },
  {
    id: 'heat-wave',
    title: 'Heat Wave',
    briefing: 'Mara wants the cops busy elsewhere. Draw three stars of heat, then shake them off completely.',
    reward: 1200,
    steps: [
      { type: 'stars-at-least', stars: 3, text: 'Raise your wanted level to 3 stars' },
      { type: 'stars-zero', text: 'Lose the cops — get back to 0 stars' },
    ],
  },
  {
    id: 'the-big-score',
    title: 'The Big Score',
    briefing: 'The Vista Mar Bank. Crack the vault, then run for the safehouse with the whole city on your tail.',
    reward: 3000,
    steps: [
      { type: 'goto', target: 'bank', text: 'Get to the Vista Mar Bank' },
      { type: 'hold', target: 'bank', seconds: 10, text: 'Hold E at the vault to crack it' },
      { type: 'escape', target: 'safehouse', text: 'Escape to the safehouse' },
    ],
  },
];

export function createMissions(G) {
  const { scene } = G;
  let index = 0;
  let stepIndex = 0;
  let holdTimer = 0;
  let marker = null;
  let markerTarget = null;
  const pickups = [];

  function makeMarker() {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.0, 32),
      new THREE.MeshBasicMaterial({ color: 0xffc93c, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    group.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 30, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 15;
    group.add(beam);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.7),
      new THREE.MeshBasicMaterial({ color: 0xffd24a }),
    );
    diamond.position.y = 4;
    group.add(diamond);
    group.visible = false;
    scene.add(group);
    return { group, ring, diamond };
  }

  marker = makeMarker();

  function current() {
    return MISSION_LIST[index] ?? null;
  }

  function currentStep() {
    const m = current();
    return m ? m.steps[stepIndex] : null;
  }

  function targetPos(name) {
    const lm = G.world.landmarks[name];
    return lm ? { x: lm.x, z: lm.z + 14 } : { x: 0, z: 0 };
  }

  function placeMarker() {
    const step = currentStep();
    if (!step || !step.target) {
      marker.group.visible = false;
      markerTarget = null;
      return;
    }
    markerTarget = targetPos(step.target);
    marker.group.position.set(markerTarget.x, 0, markerTarget.z);
    marker.group.visible = true;
  }

  function setObjective() {
    const m = current();
    const step = currentStep();
    if (!m) {
      G.hud.setObjective('Story complete — free roam. Collect stashes, cause chaos.');
      marker.group.visible = false;
      return;
    }
    G.hud.setObjective(`${m.title}: ${step.text}`);
    placeMarker();
  }

  function advanceStep() {
    const m = current();
    const step = currentStep();
    if (step && step.onDone === 'heat') {
      G.police.addHeat(20, 'the docks are watched');
    }
    stepIndex += 1;
    holdTimer = 0;
    G.audio.pickup();
    if (stepIndex >= m.steps.length) {
      G.player.cash += m.reward;
      G.hud.toast(`${m.title} complete — +$${m.reward}`);
      G.audio.missionComplete();
      G.missionsDone.push(m.id);
      index += 1;
      stepIndex = 0;
      if (index >= MISSION_LIST.length) {
        G.main.showComplete();
      }
    }
    setObjective();
  }

  function spawnPickups() {
    const geo = new THREE.BoxGeometry(0.9, 0.6, 0.5);
    const mat = new THREE.MeshBasicMaterial({ color: 0x2ecc71 });
    for (let i = 0; i < 12; i += 1) {
      const road = G.world.roadLines[G.rng.int(0, G.world.roadLines.length - 1)];
      const along = G.rng.range(-190, 190);
      const x = G.rng.chance(0.5) ? along : road + 8;
      const z = G.rng.chance(0.5) ? road + 8 : along;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 0.5, z);
      scene.add(mesh);
      pickups.push({ mesh, x, z, amount: G.rng.pick([50, 100, 100, 200]), taken: false });
    }
  }

  function update(dt) {
    if (marker.group.visible) {
      marker.ring.rotation.z += dt * 1.5;
      marker.diamond.rotation.y += dt * 2;
      marker.diamond.position.y = 4 + Math.sin(G.time * 2.5) * 0.4;
    }
    for (const p of pickups) {
      if (p.taken) continue;
      p.mesh.rotation.y += dt * 1.5;
      const d = Math.hypot(G.player.pos.x - p.x, G.player.pos.z - p.z);
      if (d < 2.2) {
        p.taken = true;
        p.mesh.visible = false;
        G.player.cash += p.amount;
        G.audio.pickup();
        G.hud.toast(`Cash stash +$${p.amount}`);
        G.effects.burst(new THREE.Vector3(p.x, 1, p.z), 0x2ecc71, 10);
      }
    }
    const m = current();
    if (!m) return;
    const step = currentStep();
    if (!step) return;
    const player = G.player;
    const near = (target, radius) => {
      const t = targetPos(target);
      return Math.hypot(player.pos.x - t.x, player.pos.z - t.z) < radius;
    };
    if (step.type === 'steal' && player.car) advanceStep();
    else if (step.type === 'deliver-car' && player.car && near(step.target, 8)) advanceStep();
    else if (step.type === 'goto' && near(step.target, 6)) advanceStep();
    else if (step.type === 'pickup' && near(step.target, 5)) advanceStep();
    else if (step.type === 'deliver' && near(step.target, 6)) advanceStep();
    else if (step.type === 'stars-at-least' && G.wanted.stars >= step.stars) advanceStep();
    else if (step.type === 'stars-zero' && G.wanted.stars === 0) advanceStep();
    else if (step.type === 'hold') {
      if (near(step.target, 6)) {
        holdTimer += dt;
        G.hud.setProgress(holdTimer / step.seconds, 'Cracking the vault…');
        if (holdTimer >= step.seconds) {
          G.hud.setProgress(0, '');
          G.police.addHeat(60, 'bank alarm!');
          advanceStep();
        }
      } else {
        holdTimer = Math.max(0, holdTimer - dt * 2);
        G.hud.setProgress(holdTimer / step.seconds, 'Cracking the vault…');
      }
    } else if (step.type === 'escape' && near(step.target, 7)) advanceStep();
    void WANTED;
  }

  function jumpTo(missionIndex) {
    index = Math.min(missionIndex, MISSION_LIST.length - 1);
    stepIndex = 0;
    holdTimer = 0;
    setObjective();
  }

  function reset() {
    index = 0;
    stepIndex = 0;
    holdTimer = 0;
    for (const p of pickups) {
      p.taken = false;
      p.mesh.visible = true;
    }
    setObjective();
  }

  function start() {
    spawnPickups();
    setObjective();
  }

  return {
    list: MISSION_LIST,
    current,
    currentStep,
    markerPos() {
      return markerTarget;
    },
    get index() {
      return index;
    },
    update,
    reset,
    start,
    setObjective,
    jumpTo,
  };
}
