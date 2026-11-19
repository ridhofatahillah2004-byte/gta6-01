// Keyboard + mouse, with pointer lock for looking around.
// `pressed(code)` is true only on the frame the key went down.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressedSet = new Set();
    this.dx = 0;
    this.dy = 0;
    this.locked = false;
    this.onFirstGesture = null;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressedSet.add(e.code);
      if (this.onFirstGesture) { const f = this.onFirstGesture; this.onFirstGesture = null; f(); }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (this.onFirstGesture) { const f = this.onFirstGesture; this.onFirstGesture = null; f(); }
      if (this.locked) this.pressedSet.add('Mouse0');
    });
  }

  lock() {
    if (!this.locked && this.canvas.requestPointerLock) {
      try { this.canvas.requestPointerLock(); } catch { /* headless or denied */ }
    }
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  isDown(code) { return this.down.has(code); }

  pressed(code) { return this.pressedSet.has(code); }

  /** Mouse movement since last frame, in pixels. */
  takeMouse() { const m = { x: this.dx, y: this.dy }; this.dx = 0; this.dy = 0; return m; }

  /** Call at the end of every frame. */
  endFrame() { this.pressedSet.clear(); }

  /** WASD / arrows as a -1..1 pair, camera-relative. */
  moveAxes() {
    const x = (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0)
      - (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
    const y = (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0)
      - (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0);
    return { x, y };
  }
}
