// HUD: DOM panels for money, wanted stars, health and missions, a canvas
// minimap, toast messages, and the title / pause / busted / wasted
// screens. All styling is inline so the game is a single static folder.
import { MISSIONS } from './config.js';
import { wantedStars } from './people.js';
import { currentObjective } from './missions.js';

function el(tag, style, text) {
  const e = document.createElement(tag);
  if (style) e.style.cssText = style;
  if (text !== undefined) e.textContent = text;
  return e;
}

const PANEL = 'position:absolute;background:rgba(8,12,20,0.72);color:#f2f5f7;border:1px solid rgba(255,255,255,0.16);border-radius:10px;padding:8px 12px;font-family:system-ui,sans-serif;pointer-events:none;';

export class HUD {
  constructor(container) {
    this.container = container;
    this.shakeAmt = 0;
    this.toasts = [];
    this.screen = 'title';

    this.topLeft = el('div', PANEL + 'top:14px;left:14px;min-width:210px;');
    this.money = el('div', 'font-size:26px;font-weight:800;color:#ffd166;');
    this.stars = el('div', 'font-size:22px;letter-spacing:3px;color:#ffd166;margin-top:2px;');
    this.health = el('div', 'margin-top:6px;height:10px;background:rgba(255,255,255,0.18);border-radius:5px;overflow:hidden;');
    this.healthFill = el('div', 'height:100%;background:#2ecc71;width:100%;');
    this.health.appendChild(this.healthFill);
    this.topLeft.appendChild(this.money);
    this.topLeft.appendChild(this.stars);
    this.topLeft.appendChild(this.health);

    this.missionPanel = el('div', PANEL + 'top:14px;left:50%;transform:translateX(-50%);text-align:center;max-width:420px;');
    this.missionTitle = el('div', 'font-size:15px;font-weight:700;');
    this.missionText = el('div', 'font-size:13px;color:#cfe3ef;margin-top:2px;');
    this.missionPanel.appendChild(this.missionTitle);
    this.missionPanel.appendChild(this.missionText);

    this.missionList = el('div', PANEL + 'left:14px;bottom:14px;font-size:13px;line-height:1.7;');
    this.missionListTitle = el('div', 'font-weight:700;color:#ffd166;');
    this.missionListTitle.textContent = 'Missions — Mara Voss (press 1–4)';
    this.missionList.appendChild(this.missionListTitle);
    this.missionRows = MISSIONS.map((m) => {
      const r = el('div', '');
      r.textContent = (m.id + 1) + '. ' + m.name + ' — $' + m.pay.toLocaleString();
      this.missionList.appendChild(r);
      return r;
    });

    this.minimap = document.createElement('canvas');
    this.minimap.width = 176;
    this.minimap.height = 176;
    this.minimap.style.cssText = 'position:absolute;right:14px;bottom:14px;border:2px solid rgba(255,255,255,0.25);border-radius:50%;background:#0b1622;pointer-events:none;';
    this.mm = this.minimap.getContext('2d');

    this.prompt = el('div', PANEL + 'left:50%;bottom:110px;transform:translateX(-50%);font-size:15px;font-weight:600;background:rgba(8,12,20,0.85);display:none;');

    this.toastBox = el('div', 'position:absolute;left:50%;bottom:170px;transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none;');

    this.overlay = el('div', 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#f2f5f7;font-family:system-ui,sans-serif;background:radial-gradient(ellipse at center,rgba(10,16,28,0.55) 0%,rgba(6,10,18,0.88) 100%);');
    this.overlayTitle = el('div', 'font-size:64px;font-weight:900;letter-spacing:6px;color:#ffd166;text-shadow:0 4px 24px rgba(0,0,0,0.6);');
    this.overlaySub = el('div', 'font-size:20px;letter-spacing:4px;color:#9fd8ef;margin-top:4px;');
    this.overlayBody = el('div', 'font-size:15px;line-height:1.9;color:#dbe7ef;margin-top:22px;max-width:520px;');
    this.overlay.appendChild(this.overlayTitle);
    this.overlay.appendChild(this.overlaySub);
    this.overlay.appendChild(this.overlayBody);

    container.appendChild(this.topLeft);
    container.appendChild(this.missionPanel);
    container.appendChild(this.missionList);
    container.appendChild(this.minimap);
    container.appendChild(this.prompt);
    container.appendChild(this.toastBox);
    container.appendChild(this.overlay);
    this.setScreen('title');
  }

  setScreen(name, data) {
    this.screen = name;
    const o = this.overlay;
    if (name === 'title') {
      o.style.display = 'flex';
      this.overlayTitle.textContent = 'SOLMAR';
      this.overlaySub.textContent = 'STREETS OF VISTA MAR';
      this.overlayBody.innerHTML = 'An open-world crime story in your browser.<br>' +
        'WASD drive &amp; walk · Mouse drag orbits · Click shoots · E steal / exit car<br>' +
        '1–4 start a mission · P pause · M mute · Shift run<br>' +
        '<b style="color:#ffd166">Click anywhere to start</b>';
    } else if (name === 'pause') {
      o.style.display = 'flex';
      this.overlayTitle.textContent = 'PAUSED';
      this.overlaySub.textContent = '';
      this.overlayBody.innerHTML = 'Press P to keep playing.<br>Progress saves automatically.';
    } else if (name === 'busted') {
      o.style.display = 'flex';
      this.overlayTitle.textContent = 'BUSTED';
      this.overlaySub.textContent = '';
      this.overlayBody.innerHTML = 'The VCPD caught up with you.<br>' +
        'Fine paid: <b style="color:#ffd166">$' + (data && data.fine ? data.fine : 150) + '</b><br>Press R to get back on the streets.';
    } else if (name === 'wasted') {
      o.style.display = 'flex';
      this.overlayTitle.textContent = 'WASTED';
      this.overlaySub.textContent = '';
      this.overlayBody.innerHTML = 'You flatlined in Vista Mar.<br>Press R to wake up at the hospital.';
    } else {
      o.style.display = 'none';
    }
  }

  toast(msg) {
    const t = el('div', 'background:rgba(8,12,20,0.85);color:#f2f5f7;border:1px solid rgba(255,209,102,0.5);border-radius:8px;padding:7px 14px;font-family:system-ui,sans-serif;font-size:14px;white-space:nowrap;');
    t.textContent = msg;
    this.toastBox.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity 0.6s';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 650);
    }, 3200);
  }

  shake(amount) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  shakeOffset() {
    if (this.shakeAmt <= 0.01) return [0, 0];
    return [(Math.random() - 0.5) * this.shakeAmt, (Math.random() - 0.5) * this.shakeAmt];
  }

  update(G, dt) {
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.4);
    this.money.textContent = '$' + Math.floor(G.money).toLocaleString();
    const stars = wantedStars(G.wanted);
    this.stars.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    this.stars.style.color = stars >= 3 ? '#ff5d5d' : '#ffd166';
    this.healthFill.style.width = Math.max(0, G.player.health) + '%';
    this.healthFill.style.background = G.player.health > 50 ? '#2ecc71' : G.player.health > 25 ? '#f39c12' : '#e74c3c';
    const obj = G.missions.active;
    if (obj) {
      this.missionPanel.style.display = 'block';
      this.missionTitle.textContent = obj.def.name + ' — $' + obj.def.pay.toLocaleString();
      const step = obj.def.steps[obj.stage];
      this.missionText.textContent = step.label + (obj.progress ? ' · ' + obj.progress : '');
    } else {
      this.missionPanel.style.display = 'none';
    }
    this.missionRows.forEach((row, i) => {
      const done = G.missions.done.includes(MISSIONS[i].id);
      row.style.textDecoration = done ? 'line-through' : 'none';
      row.style.opacity = done ? '0.55' : '1';
    });
    // Context prompt.
    let prompt = '';
    if (G.screen === 'play') {
      if (G.player.onFoot) {
        const near = G.nearCar;
        if (near) prompt = 'Press E to steal the ' + (near.kind === 'mission' ? 'mission car' : 'car');
      } else {
        prompt = 'Press E to step out';
      }
    }
    this.prompt.style.display = prompt ? 'block' : 'none';
    this.prompt.textContent = prompt;
    this.drawMinimap(G);
  }

  drawMinimap(G) {
    const ctx = this.mm;
    const S = 176;
    const scale = S / 460; // world -230..230
    const toX = (x) => (x + 230) * scale;
    const toY = (z) => (z + 230) * scale;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#101c2a';
    ctx.fillRect(0, 0, S, S);
    // Sea and beach at the bottom.
    ctx.fillStyle = '#2e6f8e';
    ctx.fillRect(0, toY(200), S, S - toY(200));
    ctx.fillStyle = '#d9b380';
    ctx.fillRect(0, toY(168), S, toY(200) - toY(168));
    // Roads.
    ctx.strokeStyle = '#3d4b5c';
    ctx.lineWidth = 4;
    for (const s of G.city.streets) {
      ctx.beginPath();
      ctx.moveTo(toX(s), toY(-200));
      ctx.lineTo(toX(s), toY(168));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX(-200), toY(s));
      ctx.lineTo(toX(200), toY(s));
      ctx.stroke();
    }
    // Park.
    ctx.fillStyle = '#2f7a3d';
    ctx.fillRect(toX(-160), toY(-160), 120 * scale, 120 * scale);
    // Stashes.
    ctx.fillStyle = '#ffd166';
    for (const s of G.missions.stash) {
      if (s.taken) continue;
      ctx.beginPath();
      ctx.arc(toX(s.x), toY(s.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Objective.
    const obj = currentObjective(G);
    if (obj) {
      const p = obj.pos;
      ctx.fillStyle = '#4dd2ff';
      ctx.save();
      ctx.translate(toX(p[0]), toY(p[1]));
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
    // Police.
    ctx.fillStyle = '#ff5d5d';
    for (const c of G.police) {
      ctx.beginPath();
      ctx.arc(toX(c.x), toY(c.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player.
    const p = G.player;
    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.translate(toX(p.x), toY(p.z));
    ctx.rotate(Math.atan2(Math.sin(p.yaw), Math.cos(p.yaw)) + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
