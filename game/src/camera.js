// Third-person follow camera. The desired spot sits behind and above the
// focus point; a segment test against the buildings pulls it in before it
// can clip through a facade, and the motion is smoothed so it never snaps.
import { clamp, lerp } from './rng.js';

export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.pos = camera.position.clone();
    this.yaw = 0;
    this.pitch = 0.42;
    this.dist = 11;
    this.look = camera.position.clone();
  }

  /** Focus on `target` (a Vector3-like {x,y,z}); yaw/pitch in radians. */
  update(dt, target, yaw, pitch, dist, segmentClear, snap = false) {
    this.yaw = yaw;
    this.pitch = clamp(pitch, 0.08, 1.1);
    this.dist = dist;
    const cx = Math.sin(yaw) * Math.cos(pitch);
    const cz = Math.cos(yaw) * Math.cos(pitch);
    const cy = Math.sin(pitch);
    const wantX = target.x + cx * dist;
    const wantY = target.y + 1.4 + cy * dist;
    const wantZ = target.z + cz * dist;
    // Keep the camera out of buildings: walk the segment back until clear.
    const fx = target.x, fy = target.y + 1.6, fz = target.z;
    const t = segmentClear(fx, fy, fz, wantX, wantY, wantZ);
    const clearDist = Math.max(2.2, dist * Math.max(0, t - 0.06));
    const px = fx + cx * clearDist;
    const py = fy + cy * clearDist;
    const pz = fz + cz * clearDist;
    const k = snap ? 1 : Math.min(1, dt * 7);
    this.pos.x = lerp(this.pos.x, px, k);
    this.pos.y = lerp(this.pos.y, Math.max(py, 1.1), k);
    this.pos.z = lerp(this.pos.z, pz, k);
    this.camera.position.copy(this.pos);
    const lx = lerp(this.look.x, target.x, Math.min(1, dt * 12));
    const ly = lerp(this.look.y, target.y + 1.6, Math.min(1, dt * 12));
    const lz = lerp(this.look.z, target.z, Math.min(1, dt * 12));
    this.look.set(lx, ly, lz);
    this.camera.lookAt(this.look);
  }
}
