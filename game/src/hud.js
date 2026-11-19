// The HUD: cash, stars, health, ammo, speed, objective, prompts, briefing
// cards, screens — and the live minimap drawn on a 2D canvas.
import { ROADS, LANDMARKS, PARK, OCEAN, TUNING, MISSIONS } from './config.js';

export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.cash = this.el('cash');
    this.stars = this.el('stars');
    this.healthFill = this.el('health-fill');
    this.ammo = this.el('ammo');
    this.speed = this.el('speed');
    this.objective = this.el('objective');
    this.prompt = this.el('prompt');
    this.brief = this.el('briefing');
    this.briefTitle = this.el('brief-title');
    this.briefText = this.el('brief-text');
    this.vignette = this.el('vignette');
    this.crosshair = this.el('crosshair');
    this.minimap = this.el('minimap');
    this.mm = this.minimap.getContext('2d');
    this.promptT = 0;
    this.briefT = 0;
    this.mmT = 0;
    this.screens = {
      title: this.el('screen-title'),
      pause: this.el('screen-pause'),
      wasted: this.el('screen-wasted'),
      complete: this.el('screen-complete'),
    };
  }

  showScreen(name) {
    for (const [key, el] of Object.entries(this.screens)) {
      if (el) el.style.display = key === name ? 'flex' : 'none';
    }
    if (this.el('hud')) this.el('hud').style.display = name ? 'none' : 'block';
    this.crosshair.style.display = name ? 'none' : 'block';
  }

  setCash(v) { this.cash.textContent = `$${v.toLocaleString('en-US')}`; }
  setHealth(h) {
    this.healthFill.style.width = `${Math.max(0, h)}%`;
    this.healthFill.style.background = h > 50 ? '#4caf50' : h > 25 ? '#ff9800' : '#f44336';
  }
  setAmmo(ammo, reloading) { this.ammo.textContent = reloading ? 'RELOADING…' : `AMMO ${ammo} / ${TUNING.pistolMag}`; }
  setSpeed(kmh) { this.speed.textContent = kmh > 0.5 ? `${Math.round(kmh)} km/h` : ''; }
  setStars(heat) {
    const n = TUNING.starsFor(heat);
    this.stars.textContent = '★'.repeat(n) + '☆'.repeat(5 - n);
    this.stars.style.color = n === 0 ? '#8899aa' : '#ffd23c';
  }
  setObjective(text) { this.objective.textContent = text; }
  setPrompt(text, seconds = 4) { this.prompt.textContent = text; this.promptT = seconds; }

  briefing(title, text, seconds = 7) {
    this.briefTitle.textContent = title;
    this.briefText.textContent = text;
    this.brief.style.display = 'block';
    this.briefT = seconds;
  }

  flashDamage() {
    this.vignette.style.opacity = '0.85';
    setTimeout(() => { this.vignette.style.opacity = '0'; }, 130);
  }

  update(dt, G) {
    if (this.promptT > 0) { this.promptT -= dt; if (this.promptT <= 0) this.prompt.textContent = ''; }
    if (this.briefT > 0) { this.briefT -= dt; if (this.briefT <= 0) this.brief.style.display = 'none'; }
    this.setCash(G.cash);
    this.setStars(G.heat);
    this.setHealth(G.player.health);
    this.setAmmo(G.combat.ammo, G.combat.reloading);
    const kmh = G.player.inCar ? Math.abs(G.player.inCar.speed) * 3.6 : 0;
    this.setSpeed(kmh);
    this.setObjective(G.missions.objectiveText());
    this.crosshair.style.display = G.player.inCar || G.state !== 'play' ? 'none' : 'block';
    this.mmT -= dt;
    if (this.mmT <= 0) { this.mmT = 0.12; this._drawMinimap(G); }
  }

  _drawMinimap(G) {
    const c = this.mm;
    const S = 200;
    const mx = (x) => ((x + 230) / 460) * S;
    const mz = (z) => ((z + 230) / 700) * S;
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#20262c'; c.fillRect(0, 0, S, S);
    // Ocean (south) and park (north-west).
    c.fillStyle = '#2a7ab8'; c.fillRect(0, mz(220), S, S - mz(220));
    c.fillStyle = '#dcc28e'; c.fillRect(0, mz(198), S, mz(220) - mz(198));
    c.fillStyle = '#3f7d33';
    c.fillRect(mx(PARK.x0), mz(PARK.z0), mx(PARK.x1) - mx(PARK.x0), mz(PARK.z1) - mz(PARK.z0));
    // Roads.
    c.strokeStyle = '#55595f'; c.lineWidth = 3;
    for (const r of ROADS) {
      c.beginPath(); c.moveTo(mx(-220), mz(r)); c.lineTo(mx(220), mz(r)); c.stroke();
      c.beginPath(); c.moveTo(mx(r), mz(-220)); c.lineTo(mx(r), mz(220)); c.stroke();
    }
    // Buildings.
    c.fillStyle = '#6a7076';
    for (const b of G.city.colliders) {
      c.fillRect(mx(b.minX), mz(b.minZ), Math.max(1, mx(b.maxX) - mx(b.minX)), Math.max(1, mz(b.maxZ) - mz(b.minZ)));
    }
    // Landmarks.
    c.font = 'bold 9px sans-serif'; c.textAlign = 'center';
    for (const [name, L] of Object.entries(LANDMARKS)) {
      c.fillStyle = '#ffd23c';
      c.fillRect(mx(L.x) - 3, mz(L.z) - 3, 6, 6);
      c.fillStyle = '#ffffff';
      c.fillText(name[0], mx(L.x), mz(L.z) - 5);
    }
    // Uncollected stashes.
    c.fillStyle = '#4caf50';
    for (const s of G.missions.stashes) {
      if (!s.taken) { c.beginPath(); c.arc(mx(s.x), mz(s.z), 2.2, 0, Math.PI * 2); c.fill(); }
    }
    // Mission target: pulsing yellow diamond.
    const target = G.missions.targetPos(G);
    if (target) {
      const pulse = 4 + Math.sin(performance.now() * 0.006) * 1.6;
      c.fillStyle = '#ffd23c';
      c.save();
      c.translate(mx(target.x), mz(target.z));
      c.rotate(Math.PI / 4);
      c.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
      c.restore();
    }
    // Police: red dots.
    c.fillStyle = '#ff3b30';
    for (const car of G.vehicles.police) {
      c.beginPath(); c.arc(mx(car.mesh.position.x), mz(car.mesh.position.z), 3, 0, Math.PI * 2); c.fill();
    }
    // Player: white arrow, rotated to the facing.
    const p = G.player.pos;
    c.save();
    c.translate(mx(p.x), mz(p.z));
    c.rotate(G.player.yaw);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(0, -6); c.lineTo(4.4, 5); c.lineTo(-4.4, 5); c.closePath(); c.fill();
    c.restore();
  }
}
