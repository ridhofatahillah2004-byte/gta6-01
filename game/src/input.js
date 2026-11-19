// Keyboard + mouse input. Camera orbits by dragging (no pointer lock needed,
// so it works in a plain browser tab and in headless screenshots); clicking
// the canvas also tries pointer lock for a locked mouse-look feel.
import { KEYS } from './config.js';

const ACTION_CONFIRM = 1;
const ACTION_PAUSE = 2;
const ACTION_MUTE = 4;

export { ACTION_CONFIRM, ACTION_PAUSE, ACTION_MUTE };

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDown = false;
  let shootHeld = false;
  let yawDelta = 0;
  let pitchDelta = 0;
  let lastX = 0;
  let lastY = 0;

  function isDown(list) {
    return list.some((code) => keys.has(code));
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Space' || event.code === 'Enter') actions |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (event) => {
    mouseDown = true;
    shootHeld = true;
    lastX = event.clientX;
    lastY = event.clientY;
    if (document.pointerLockElement !== canvas) {
      try {
        canvas.requestPointerLock();
      } catch {
        // Pointer lock is a nicety, not a requirement.
      }
    }
  });
  window.addEventListener('mouseup', () => {
    mouseDown = false;
    shootHeld = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === canvas) {
      yawDelta -= event.movementX * 0.0032;
      pitchDelta -= event.movementY * 0.0028;
    } else if (mouseDown) {
      yawDelta -= (event.clientX - lastX) * 0.006;
      pitchDelta -= (event.clientY - lastY) * 0.005;
      lastX = event.clientX;
      lastY = event.clientY;
    }
  });

  return {
    /** -1..1 forward/back and left/right for this frame. */
    move() {
      return {
        forward: (isDown(KEYS.up) ? 1 : 0) - (isDown(KEYS.down) ? 1 : 0),
        strafe: (isDown(KEYS.right) ? 1 : 0) - (isDown(KEYS.left) ? 1 : 0),
      };
    },
    sprint() {
      return isDown(KEYS.sprint);
    },
    jump() {
      return isDown(KEYS.jump);
    },
    enterCar() {
      return isDown(KEYS.enterCar);
    },
    reload() {
      return isDown(KEYS.reload);
    },
    shootHeld() {
      return shootHeld;
    },
    /** Mouse-look deltas since the last read, in radians. */
    lookDelta() {
      const d = { yaw: yawDelta, pitch: pitchDelta };
      yawDelta = 0;
      pitchDelta = 0;
      return d;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
