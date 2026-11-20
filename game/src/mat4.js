// Column-major 4x4 matrices as Float32Array(16), the layout WebGL expects.
// Model matrices in this game are translation * rotation only (uniform
// scale 1), so normals stay correct under a plain mat3 multiply.
export function identity() {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

export function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export function lookAt(eye, target, up) {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
  m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
  m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let s = 0;
      for (let k = 0; k < 4; k += 1) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

export function translation(x, y, z) {
  const m = identity();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

export function rotationY(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = identity();
  m[0] = c; m[2] = -s;
  m[8] = s; m[10] = c;
  return m;
}

export function rotationX(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = identity();
  m[5] = c; m[6] = s;
  m[9] = -s; m[10] = c;
  return m;
}

export function rotationZ(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = identity();
  m[0] = c; m[1] = s;
  m[4] = -s; m[5] = c;
  return m;
}

// Model matrix: translate, then rotate around Y (yaw), then around X (pitch).
export function model(x, y, z, yaw, pitch) {
  let m = translation(x, y, z);
  m = multiply(m, rotationY(yaw));
  if (pitch) m = multiply(m, rotationX(pitch));
  return m;
}

// Transform a point by a matrix (for camera math and ray tests).
export function transformPoint(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}
