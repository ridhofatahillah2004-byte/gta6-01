// Save progress to localStorage: money, finished missions, collected
// stashes, the player's spot and health. Saved on big events and every
// ten seconds of play.
import { SAVE_KEY } from './config.js';

export function saveGame(G) {
  try {
    const data = {
      money: Math.floor(G.money),
      done: G.missions.done,
      stashTaken: G.missions.stash.map((s) => s.taken),
      x: G.player.x,
      z: G.player.z,
      health: G.player.health,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    // Private mode or a full quota: the game keeps running without saves.
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number') return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function applySave(G, data) {
  if (!data) return;
  G.money = data.money;
  G.missions.done = data.done || [];
  if (Array.isArray(data.stashTaken)) {
    data.stashTaken.forEach((t, i) => {
      if (t && G.missions.stash[i]) G.missions.stash[i].taken = true;
    });
  }
  if (typeof data.x === 'number' && typeof data.z === 'number') {
    G.player.x = data.x;
    G.player.z = data.z;
    G.player.y = G.city.groundHeight(data.x, data.z);
  }
  if (typeof data.health === 'number') G.player.health = data.health;
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) { /* ignore */ }
}
