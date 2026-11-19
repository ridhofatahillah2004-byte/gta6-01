// SOLMAR: Streets of Vista Mar — bootstrap, game loop, player, states, save.
// The Game object is the shared state every system reads (called `G` there).
import * as THREE from 'three';
import { LANDMARKS, TUNING, MISSIONS, SAVE_KEY } from './config.js';
import { clamp, angleDiff } from './rng.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import { buildCity } from './city.js';
import { VehicleWorld } from './vehicles.js';
import { Crowd } from './people.js';
import { MissionSystem } from './missions.js';
import { Combat } from './combat.js';
import { HUD } from './hud.js';
import { FollowCamera } from './camera.js';
import { stageShot } from './shots.js';

const SPAWN = { x: 22, z: 120 };

function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.44, 1.05, 8),
    new THREE.MeshLambertMaterial({ color: 0x2e6db8 }),
  );
  jacket.position.y = 0.85; jacket.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd8a878 }),
  );
  head.position.y = 1.64; head.castShadow = true;
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.29, 0.29, 0.1, 10),
    new THREE.MeshLambertMaterial({ color: 0xc23b2e }),
  );
  cap.position.y = 1.86;
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.55, 0.32),
    new THREE.MeshLambertMaterial({ color: 0x2c3240 }),
  );
  legs.position.y = 0.28;
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.12, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x1a1d22 }),
  );
  gun.position.set(0.42, 1.05, 0.3);
  g.add(jacket, head, cap, legs, gun);
  return g;
}

export class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fc3e8);
    this.scene.fog = new THREE.Fog(0xa8c8de, 180, 430);

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(60, 60, 160);

    const sun = new THREE.DirectionalLight(0xfff2cf, 2.6);
    sun.position.set(-140, 190, -120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -240; sun.shadow.camera.right = 240;
    sun.shadow.camera.top = 240; sun.shadow.camera.bottom = -240;
    sun.shadow.camera.far = 620;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.15));

    this.city = buildCity(this.scene);
    this.vehicles = new VehicleWorld(this.scene, this.city);
    this.crowd = new Crowd(this.scene, this.city, this.vehicles);
    this.missions = new MissionSystem(this.scene, this.city);
    this.combat = new Combat(this.scene);
    this.hud = new HUD();
    this.input = new Input(this.renderer.domElement);
    this.audio = new AudioSys();
    this.followCam = new FollowCamera(this.camera);

    this.playerMesh = makePlayerMesh();
    this.scene.add(this.playerMesh);

    this.player = { pos: new THREE.Vector3(SPAWN.x, 0, SPAWN.z), yaw: Math.PI, health: TUNING.playerHealth, inCar: null };
    this.cash = 0;
    this.heat = 0;
    this.time = 0;
    this.state = 'title';
    this.camYaw = Math.PI;
    this.camPitch = 0.42;
    this.camDistOverride = null;
    this.camPitchOverride = null;
    this.lastHeatUp = -100;
    this.saveTimer = 0;
    this.shootTargets = [];
    this._camSnap = true;

    this.input.onFirstGesture = () => this.audio.unlock();
    window.addEventListener('resize', () => this._resize());
    this._wireButtons();

    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    const save = this._loadSave();
    if (shot) {
      // Screenshot mode: skip the title, stage the scene, play.
      this.state = 'play';
      this.hud.showScreen(null);
      stageShot(shot, this);
      document.title = `SOLMAR shot ${shot}`;
    } else if (save) {
      this._applySave(save);
      this.hud.showScreen('title');
      const cont = document.getElementById('btn-continue');
      if (cont) { cont.style.display = 'inline-block'; cont.textContent = `Continue — $${save.cash.toLocaleString('en-US')}, Job ${Math.min(save.mission + 1, 4)}/4`; }
    } else {
      this.hud.showScreen('title');
    }
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    window.__game = this;
  }

  _resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _wireButtons() {
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', () => { this.audio.unlock(); this.audio.click(); fn(); }); };
    on('btn-start', () => this.startGame(true));
    on('btn-continue', () => this.startGame(false));
    on('btn-resume', () => this.resume());
    on('btn-restart', () => this.startGame(true));
    on('btn-retry', () => this.respawn());
    on('btn-freeroam', () => { this.state = 'play'; this.hud.showScreen(null); this.input.lock(); });
    on('btn-mute', () => { this.audio.setMuted(!this.audio.muted); document.getElementById('btn-mute').textContent = this.audio.muted ? 'Sound: OFF' : 'Sound: ON'; });
  }

  _loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s.cash === 'number') return s;
    } catch { /* no save */ }
    return null;
  }

  _applySave(save) {
    this.cash = save.cash || 0;
    this.missions.reset(save);
    this.player.health = save.health ?? TUNING.playerHealth;
  }

  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.cash, mission: this.missions.mi,
        stashes: [...this.missions.stashTaken], health: this.player.health,
      }));
    } catch { /* storage unavailable */ }
  }

  startFresh() {
    this.cash = 0;
    this.heat = 0;
    this.player.health = TUNING.playerHealth;
    this.player.pos.set(SPAWN.x, 0, SPAWN.z);
    this.player.yaw = Math.PI;
    this.player.inCar = null;
    this.missions.reset({ mission: 0, stashes: [] });
    this.combat.reset();
    this.camYaw = Math.PI;
    this.camPitch = 0.42;
    this.state = 'play';
  }

  startGame(newGame) {
    if (newGame) {
      this.startFresh();
    } else {
      const save = this._loadSave();
      if (save) this._applySave(save);
      this.player.pos.set(SPAWN.x, 0, SPAWN.z);
      this.player.yaw = Math.PI;
      this.state = 'play';
    }
    this.hud.showScreen(null);
    this.input.lock();
    const m = this.missions.current();
    if (m) this.hud.briefing(m.title, `${m.brief}  Reward: $${m.reward}.`);
    this.saveGame();
  }

  resume() {
    this.state = 'play';
    this.hud.showScreen(null);
    this.input.lock();
  }

  respawn() {
    this.player.health = TUNING.playerHealth;
    this.heat = 0;
    const S = LANDMARKS.SAFEHOUSE;
    this.player.pos.set(S.x + 8, 0, S.z + 8);
    this.player.yaw = Math.PI;
    this.player.inCar = null;
    this.state = 'play';
    this.hud.showScreen(null);
    this.input.lock();
    this.hud.setPrompt('You wake up at the safehouse. Mara is waiting.');
    this.saveGame();
  }

  addCash(n) { this.cash += n; this.saveGame(); }
  addHeat(n) { this.heat = Math.min(100, this.heat + n); this.lastHeatUp = this.time; }
  setHeat(v) { this.heat = Math.max(0, Math.min(100, v)); this.lastHeatUp = this.time; }

  damagePlayer(n) {
    if (this.state !== 'play') return;
    this.player.health -= n;
    this.hud.flashDamage();
    if (this.player.health <= 0) {
      this.player.health = 0;
      this._wasted('shot');
    }
  }

  busted() {
    if (this.state === 'play') this._wasted('busted');
  }

  _wasted(cause) {
    this.state = 'wasted';
    this.audio.wasted();
    this.audio.siren(false);
    this.audio.engine(0, false);
    this.input.unlock();
    const el = document.getElementById('wasted-text');
    if (el) el.textContent = cause === 'busted'
      ? 'The VCPD pulled you out of the street in cuffs. Mara posts your bail — this time.'
      : 'You went down in the streets of Vista Mar. Mara is already planning the comeback.';
    this.hud.showScreen('wasted');
    this.saveGame();
  }

  storyComplete() {
    this.state = 'complete';
    this.audio.siren(false);
    this.audio.engine(0, false);
    this.input.unlock();
    const el = document.getElementById('complete-stats');
    if (el) el.textContent = `All four jobs done. Mara Voss pays out $${this.cash.toLocaleString('en-US')} — Vista Mar is yours now.`;
    this.hud.showScreen('complete');
    this.saveGame();
  }

  tryEnterExit() {
    const p = this.player;
    if (p.inCar) {
      this.vehicles.exitCar(p);
      this.audio.click();
      return;
    }
    const car = this.vehicles.nearestEnterable(p.pos.x, p.pos.z, 5);
    if (!car) { this.audio.denied(); return; }
    this.vehicles.enterCar(car, p);
    this.addHeat(TUNING.heatStealCar);
    this.audio.click();
    this.hud.setPrompt('Car stolen — the heat is on!');
    this.camYaw = car.heading + Math.PI;
  }

  stepWorld(dt, inputOverride) {
    const inp = inputOverride || this.input;
    const p = this.player;
    const m = inp.takeMouse();
    if (p.inCar) {
      this.camYaw += angleDiff(this.camYaw, p.inCar.heading + Math.PI) * Math.min(1, dt * 2.2);
      this.camYaw -= m.x * 0.0016;
      this.camPitch = clamp(this.camPitch + m.y * 0.0022, 0.12, 0.7);
    } else {
      this.camYaw -= m.x * 0.0032;
      this.camPitch = clamp(this.camPitch + m.y * 0.0022, 0.08, 1.0);
    }
    if (inp.pressed('KeyE')) this.tryEnterExit();
    if (inp.pressed('KeyR')) this.combat.reload(this);
    if (inp.pressed('KeyM')) {
      const mission = this.missions.current();
      if (mission) this.hud.briefing(mission.title, `${mission.brief}  Reward: $${mission.reward}.`);
    }
    if (inp.pressed('Digit0')) this.audio.setMuted(!this.audio.muted);
    if (inp.pressed('Escape') || inp.pressed('KeyP')) {
      if (this.state === 'play') {
        this.state = 'paused';
        this.hud.showScreen('pause');
        this.input.unlock();
        this.audio.siren(false);
        this.audio.engine(0, false);
      }
    }
    if (inp.pressed('Mouse0') && !p.inCar && this.input.locked) this.combat.fire(this);

    if (p.inCar) {
      this.vehicles.updatePlayerCar(dt, inp);
      p.pos.copy(p.inCar.pos);
      p.yaw = p.inCar.heading;
      this.audio.engine(Math.abs(p.inCar.speed) / TUNING.carMaxSpeed, true);
    } else {
      this.audio.engine(0, false);
      const axes = inp.moveAxes();
      const fwd = new THREE.Vector3();
      this.camera.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() < 0.001) fwd.set(0, 0, -1); else fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      const mv = new THREE.Vector3().addScaledVector(fwd, axes.y).addScaledVector(right, axes.x);
      const run = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
      const speed = run ? TUNING.runSpeed : TUNING.walkSpeed;
      if (mv.lengthSq() > 0.001) {
        mv.normalize();
        p.yaw = Math.atan2(mv.x, mv.z);
        const np = { x: p.pos.x + mv.x * speed * dt, z: p.pos.z + mv.z * speed * dt };
        this.city.resolveCircle(np, TUNING.playerRadius);
        p.pos.x = np.x; p.pos.z = np.z;
      }
    }

    this.vehicles.updateTraffic(dt);
    this.crowd.update(dt, this);
    this.missions.update(dt, this);
    this.combat.update(dt);

    // Wanted heat cools off only when it has been quiet a while.
    const nearPolice = this.vehicles.police.some((c) =>
      Math.hypot(c.mesh.position.x - p.pos.x, c.mesh.position.z - p.pos.z) < 45);
    if (this.time - this.lastHeatUp > 5 && !nearPolice && this.heat > 0) {
      this.heat = Math.max(0, this.heat - TUNING.heatDecay * dt);
    }

    const focus = p.inCar
      ? { x: p.inCar.pos.x, y: 1.5, z: p.inCar.pos.z }
      : { x: p.pos.x, y: 1.2, z: p.pos.z };
    const dist = this.camDistOverride ?? (p.inCar ? 13 : 8.5);
    const pitch = this.camPitchOverride ?? this.camPitch;
    this.followCam.update(dt, focus, this.camYaw, pitch, dist, this.city.segmentClear, this._camSnap);
    this._camSnap = false;

    this.playerMesh.visible = !p.inCar;
    if (!p.inCar) {
      this.playerMesh.position.copy(p.pos);
      this.playerMesh.rotation.y = p.yaw;
    }
    this.shootTargets = [
      ...this.city.solids,
      ...this.crowd.peds.map((ped) => ped.mesh),
      ...this.vehicles.police.map((c) => c.mesh),
    ];
    this.hud.update(dt, this);
    this.saveTimer += dt;
    if (this.saveTimer > 10) { this.saveTimer = 0; this.saveGame(); }
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    if (this.state === 'play') this.stepWorld(dt);
    this.city.update(dt);
    if (this.state === 'title') {
      // Slow orbit over downtown behind the title card.
      const a = this.time * 0.05;
      this.camera.position.set(Math.sin(a) * 150, 95, Math.cos(a) * 150);
      this.camera.lookAt(0, 8, 0);
    }
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }
}

window.addEventListener('DOMContentLoaded', () => { new Game(); });
