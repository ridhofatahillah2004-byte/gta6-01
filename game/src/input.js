// Keyboard and mouse for SOLMAR. WASD / arrows move and drive, the mouse
// orbits the camera on drag and shoots on click, E interacts, P pauses,
// M mutes. Edge-triggered presses are consumed once per frame.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.dragDX = 0;
    this.dragDY = 0;
    this.clicks = [];
    this.dragging = false;
    this.downX = 0;
    this.downY = 0;
    this.moved = 0;
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.dragging = false;
    });

    canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this.downX = e.clientX;
      this.downY = e.clientY;
      this.moved = 0;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      this.dragDX += dx;
      this.dragDY += dy;
      this.moved += Math.abs(dx) + Math.abs(dy);
    });
    window.addEventListener('mouseup', (e) => {
      if (this.dragging && this.moved < 6) {
        const r = canvas.getBoundingClientRect();
        this.clicks.push({ x: e.clientX - r.left, y: e.clientY - r.top });
      }
      this.dragging = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // True once, on the frame the key went down.
  wasPressed(code) {
    return this.pressed.has(code);
  }

  // WASD / arrows as -1..1 axes. y is forward, x is strafe/right.
  axes() {
    let y = 0;
    let x = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    return { x, y };
  }

  // Mouse drag since last frame, in pixels; resets on read.
  consumeDrag() {
    const d = { dx: this.dragDX, dy: this.dragDY };
    this.dragDX = 0;
    this.dragDY = 0;
    return d;
  }

  consumeClick() {
    return this.clicks.shift() || null;
  }

  endFrame() {
    this.pressed.clear();
  }
}
