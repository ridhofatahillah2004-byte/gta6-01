// Save / continue through localStorage: cash, story progress, best cash and
// lifetime stats. Storage failures (private windows) are swallowed.
import { SAVE_KEY, BEST_KEY } from './config.js';

export function createSave() {
  function read(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be off: the game still runs, it just does not persist.
    }
  }

  return {
    load() {
      return read(SAVE_KEY);
    },
    saveGame(G) {
      write(SAVE_KEY, {
        cash: Math.floor(G.player.cash),
        missionIndex: G.missions.index,
        missionsDone: G.missionsDone,
        carsStolen: G.stats.carsStolen,
        playSeconds: Math.floor(G.stats.playSeconds),
        savedAt: Date.now(),
      });
      const best = read(BEST_KEY) || 0;
      if (G.player.cash > best) write(BEST_KEY, Math.floor(G.player.cash));
    },
    readBest() {
      return read(BEST_KEY) || 0;
    },
    recordMission(id) {
      // G.missionsDone is filled by the caller before this runs.
    },
    clear() {
      try {
        window.localStorage.removeItem(SAVE_KEY);
      } catch {
        // Nothing to clear.
      }
    },
  };
}
