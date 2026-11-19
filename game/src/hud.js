// The HUD: wanted stars, health, cash, ammo, speed, objective line, progress
// bar, toasts, damage flash and the live minimap (roads, beach, player,
// traffic, police and the mission marker).
import { WORLD } from './config.js';

export function createHud(G) {
  const el = (id) => document.getElementById(id);
  const starsEl = el('stars');
  const healthFill = el('health-fill');
  const cashEl = el('cash');
  const ammoEl = el('ammo');
  const speedEl = el('speed');
  const objectiveEl = el('objective');
  const progressWrap = el('progress-wrap');
  const progressFill = el('progress-fill');
  const progressLabel = el('progress-label');
  const toastEl = el('toast');
  const damageEl = el('damage');
  const centerEl = el('center-msg');
  const crosshairEl = el('crosshair');
  const minimap = el('minimap');
  const mmCtx = minimap.getContext('2d');
  let toastTimer = null;
  let centerTimer = null;

  const MAP_SIZE = 200;
  const SCALE = MAP_SIZE / (WORLD.CITY_RADIUS * 2 + 40);

  function toMap(x, z) {
    return {
      x: (x + WORLD.CITY_RADIUS + 20) * SCALE,
      y: (z + WORLD.CITY_RADIUS + 20) * SCALE,
    };
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  function centerMessage(message, sub) {
    centerEl.innerHTML = `<div class="center-title">${message}</div>${sub ? `<div class="center-sub">${sub}</div>` : ''}`;
    centerEl.classList.add('show');
    if (centerTimer) window.clearTimeout(centerTimer);
    centerTimer = window.setTimeout(() => centerEl.classList.remove('show'), 3600);
  }

  function damageFlash() {
    damageEl.classList.add('show');
    window.setTimeout(() => damageEl.classList.remove('show'), 220);
  }

  function setObjective(text) {
    objectiveEl.textContent = text;
  }

  function setProgress(ratio, label) {
    if (ratio > 0) {
      progressWrap.classList.add('show');
      progressFill.style.width = `${Math.round(ratio * 100)}%`;
      progressLabel.textContent = label;
    } else {
      progressWrap.classList.remove('show');
    }
  }

  function drawMinimap() {
    const ctx = mmCtx;
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.fillStyle = '#1d2733';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Beach + ocean.
    const beach = toMap(WORLD.BEACH_X, 0);
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(beach.x, 0, MAP_SIZE - beach.x, MAP_SIZE);
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(toMap(WORLD.OCEAN_X, 0).x, 0, MAP_SIZE, MAP_SIZE);
    // Roads.
    ctx.strokeStyle = '#5a636e';
    ctx.lineWidth = 3;
    for (const c of G.world.roadLines) {
      const a = toMap(c, -WORLD.CITY_RADIUS);
      const b = toMap(c, WORLD.CITY_RADIUS);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const d = toMap(-WORLD.CITY_RADIUS, c);
      const e = toMap(WORLD.CITY_RADIUS, c);
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
    }
    // Mission marker.
    const target = G.missions.markerPos();
    if (target) {
      const p = toMap(target.x, target.z);
      ctx.fillStyle = '#ffc93c';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 7);
      ctx.lineTo(p.x + 6, p.y);
      ctx.lineTo(p.x, p.y + 7);
      ctx.lineTo(p.x - 6, p.y);
      ctx.closePath();
      ctx.fill();
    }
    // Traffic (white), police (flashing red/blue), player (gold arrow).
    ctx.fillStyle = '#dfe6ee';
    for (const car of G.vehicles.cars) {
      if (car.kind === 'police') continue;
      const p = toMap(car.pos.x, car.pos.z);
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    const flash = Math.floor(G.time * 4) % 2 === 0;
    for (const car of G.vehicles.cars) {
      if (car.kind !== 'police') continue;
      const p = toMap(car.pos.x, car.pos.z);
      ctx.fillStyle = flash ? '#ff4040' : '#4060ff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    const pp = toMap(G.player.pos.x, G.player.pos.z);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(-G.player.angle + Math.PI);
    ctx.fillStyle = '#ffc93c';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#9fb2c8';
    ctx.font = 'bold 10px Arial';
    ctx.fillText('N', MAP_SIZE / 2 - 3, 11);
  }

  function update() {
    const player = G.player;
    const w = G.wanted;
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < w.stars ? '★' : '☆';
    starsEl.textContent = stars;
    starsEl.classList.toggle('hot', w.stars > 0);
    healthFill.style.width = `${Math.max(0, player.health)}%`;
    healthFill.classList.toggle('low', player.health < 35);
    cashEl.textContent = `$${Math.floor(player.cash).toLocaleString('en-US')}`;
    ammoEl.textContent = player.onFoot ? (player.reloading > 0 ? 'RELOADING…' : `AMMO ${player.ammo} / 12`) : '';
    speedEl.textContent = player.car ? `${Math.round(Math.abs(player.car.speed) * 3.6)} km/h` : '';
    crosshairEl.style.display = player.onFoot && G.mode === 'play' ? 'block' : 'none';
    drawMinimap();
  }

  return {
    toast, centerMessage, damageFlash, setObjective, setProgress, update, drawMinimap,
  };
}
