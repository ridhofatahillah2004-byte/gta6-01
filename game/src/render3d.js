// SOLMAR's own tiny WebGL renderer. No library: one shader program,
// flat-shaded low-poly geometry, one directional sun, warm haze fog and
// procedural canvas textures (building facades, roads). Everything the
// game draws goes through here, opaque first, transparent last.
import { identity, lookAt, multiply, perspective } from './mat4.js';

const VERT = `
attribute vec3 aPos;
attribute vec3 aNor;
attribute vec3 aCol;
attribute vec2 aUv;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform vec2 uUvOffset;
varying vec3 vCol;
varying vec3 vNor;
varying vec2 vUv;
varying float vDist;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vec4 vp = uView * wp;
  vDist = -vp.z;
  vCol = aCol;
  vNor = mat3(uModel) * aNor;
  vUv = aUv + uUvOffset;
  gl_Position = uProj * vp;
}
`;

const FRAG = `
precision mediump float;
uniform sampler2D uTex;
uniform float uUseTex;
uniform float uEmissive;
uniform float uAlpha;
uniform vec3 uLightDir;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vCol;
varying vec3 vNor;
varying vec2 vUv;
varying float vDist;
void main() {
  vec3 tex = uUseTex > 0.5 ? texture2D(uTex, vUv).rgb : vec3(1.0);
  vec3 base = vCol * tex;
  vec3 n = normalize(vNor);
  float diff = max(dot(n, normalize(uLightDir)), 0.0);
  vec3 col = uEmissive > 0.5 ? base : base * (0.5 + 0.5 * diff);
  float f = clamp((vDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, uAlpha);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

// --- geometry builders: each returns { pos, nor, col, uv, idx } ---
// A face is 4 vertices (a,b,c,d) with a normal and a shade factor.
function pushFace(g, a, b, c, d, normal, color, shade, uvScale) {
  const base = g.pos.length / 3;
  const pts = [a, b, c, d];
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let i = 0; i < 4; i += 1) {
    g.pos.push(pts[i][0], pts[i][1], pts[i][2]);
    g.nor.push(normal[0], normal[1], normal[2]);
    g.col.push(color[0] * shade, color[1] * shade, color[2] * shade);
    g.uv.push(uvs[i][0] * uvScale, uvs[i][1] * uvScale);
  }
  g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

export function makeBox(w, h, d, color, uvScale) {
  const g = { pos: [], nor: [], col: [], uv: [], idx: [] };
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const s = uvScale || 0;
  // +y top, -y bottom, then the four sides.
  pushFace(g, [-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z], [0, 1, 0], color, 1.0, 0);
  pushFace(g, [-x, -y, z], [x, -y, z], [x, -y, -z], [-x, -y, -z], [0, -1, 0], color, 0.55, 0);
  pushFace(g, [x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z], [1, 0, 0], color, 0.8, s);
  pushFace(g, [-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z], [-1, 0, 0], color, 0.8, s);
  pushFace(g, [-x, -y, z], [-x, y, z], [x, y, z], [x, -y, z], [0, 0, 1], color, 0.92, s);
  pushFace(g, [x, -y, -z], [x, y, -z], [-x, y, -z], [x, -y, -z], [0, 0, -1], color, 0.72, s);
  return g;
}

// Flat quad on the ground (y = 0), facing up. uvScale tiles the texture.
export function makeGround(w, d, color, uvScale) {
  const g = { pos: [], nor: [], col: [], uv: [], idx: [] };
  const s = uvScale || 0;
  pushFace(g, [-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [-w / 2, 0, d / 2], [0, 1, 0], color, 1.0, s);
  return g;
}

// Upright quad facing +z, centred at its middle (for signs, billboards).
export function makePanel(w, h, color) {
  const g = { pos: [], nor: [], col: [], uv: [], idx: [] };
  pushFace(g, [-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], [w / 2, h / 2, 0], [-w / 2, h / 2, 0], [0, 0, 1], color, 1.0, 1);
  return g;
}

// Vertical prism (cylinder with `sides` faces), centred at its middle.
export function makePrism(radius, height, sides, color) {
  const g = { pos: [], nor: [], col: [], uv: [], idx: [] };
  const y0 = -height / 2;
  const y1 = height / 2;
  for (let i = 0; i < sides; i += 1) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const x0 = Math.cos(a0) * radius;
    const z0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius;
    const z1 = Math.sin(a1) * radius;
    const nx = Math.cos((a0 + a1) / 2);
    const nz = Math.sin((a0 + a1) / 2);
    pushFace(g, [x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], [nx, 0, nz], color, 0.85, 1);
  }
  return g;
}

// Cone pointing up from its base (spire, lighthouse roof).
export function makeCone(radius, height, sides, color) {
  const g = { pos: [], nor: [], col: [], uv: [], idx: [] };
  const base = g.pos.length / 3;
  for (let i = 0; i < sides; i += 1) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const x0 = Math.cos(a0) * radius;
    const z0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius;
    const z1 = Math.sin(a1) * radius;
    const nx = Math.cos((a0 + a1) / 2);
    const nz = Math.sin((a0 + a1) / 2);
    g.pos.push(x0, 0, z0, x1, 0, z1, 0, height, 0);
    for (let k = 0; k < 3; k += 1) g.nor.push(nx, 0.6, nz);
    for (let k = 0; k < 3; k += 1) g.col.push(color[0] * 0.9, color[1] * 0.9, color[2] * 0.9);
    g.uv.push(0, 0, 1, 0, 0.5, 1);
    g.idx.push(base + i * 3, base + i * 3 + 1, base + i * 3 + 2);
  }
  return g;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: true });
    if (!gl) throw new Error('WebGL is not available in this browser.');
    this.gl = gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('program: ' + gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);
    this.prog = prog;
    this.loc = {};
    for (const name of ['aPos', 'aNor', 'aCol', 'aUv']) {
      this.loc[name] = gl.getAttribLocation(prog, name);
    }
    for (const name of ['uProj', 'uView', 'uModel', 'uUvOffset', 'uTex', 'uUseTex', 'uEmissive', 'uAlpha', 'uLightDir', 'uFogColor', 'uFogNear', 'uFogFar']) {
      this.loc[name] = gl.getUniformLocation(prog, name);
    }
    // One white 1x1 texture for untextured draws.
    const white = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, white);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    this.whiteTex = white;
    this.opaque = [];
    this.transparent = [];
    this.view = identity();
    this.proj = identity();
    this.lightDir = [0.45, 0.72, 0.35];
    this.fogColor = [0.98, 0.82, 0.62];
    this.fogNear = 90;
    this.fogFar = 420;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  setCamera(eye, target, fovDeg, aspect) {
    this.view = lookAt(eye, target, [0, 1, 0]);
    this.proj = perspective((fovDeg * Math.PI) / 180, aspect, 0.1, 900);
  }

  // Upload a geometry once; keep the returned mesh for every draw.
  mesh(geo) {
    const gl = this.gl;
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const n = geo.pos.length / 3;
    // One interleaved buffer: pos(3) + normal(3) + colour(3) + pad(1),
    // stride 40 bytes. UVs ride in a second buffer.
    const full = new Float32Array(n * 10);
    for (let i = 0; i < n; i += 1) {
      full[i * 10] = geo.pos[i * 3];
      full[i * 10 + 1] = geo.pos[i * 3 + 1];
      full[i * 10 + 2] = geo.pos[i * 3 + 2];
      full[i * 10 + 3] = geo.nor[i * 3];
      full[i * 10 + 4] = geo.nor[i * 3 + 1];
      full[i * 10 + 5] = geo.nor[i * 3 + 2];
      full[i * 10 + 6] = geo.col[i * 3];
      full[i * 10 + 7] = geo.col[i * 3 + 1];
      full[i * 10 + 8] = geo.col[i * 3 + 2];
      full[i * 10 + 9] = 0;
    }
    // Store uv in a separate buffer to keep the stride simple.
    gl.bufferData(gl.ARRAY_BUFFER, full, gl.STATIC_DRAW);
    const uvbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.uv), gl.STATIC_DRAW);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geo.idx), gl.STATIC_DRAW);
    return { vbo, uvbo, ibo, count: geo.idx.length };
  }

  textureFromCanvas(canvas) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
  }

  beginFrame(sky) {
    const gl = this.gl;
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.opaque.length = 0;
    this.transparent.length = 0;
  }

  // Queue a draw. opts: { tex, emissive, alpha, uvOffset }.
  draw(mesh, modelMatrix, opts) {
    const item = { mesh, model: modelMatrix, opts: opts || {} };
    if (item.opts.alpha !== undefined && item.opts.alpha < 1) this.transparent.push(item);
    else this.opaque.push(item);
  }

  endFrame() {
    const gl = this.gl;
    const L = this.loc;
    gl.uniformMatrix4fv(L.uProj, false, this.proj);
    gl.uniformMatrix4fv(L.uView, false, this.view);
    gl.uniform3fv(L.uLightDir, this.lightDir);
    gl.uniform3fv(L.uFogColor, this.fogColor);
    gl.uniform1f(L.uFogNear, this.fogNear);
    gl.uniform1f(L.uFogFar, this.fogFar);
    for (const item of this.opaque) this.drawOne(item);
    for (const item of this.transparent) this.drawOne(item);
  }

  drawOne(item) {
    const gl = this.gl;
    const L = this.loc;
    const opts = item.opts;
    gl.bindBuffer(gl.ARRAY_BUFFER, item.mesh.vbo);
    gl.enableVertexAttribArray(L.aPos);
    gl.vertexAttribPointer(L.aPos, 3, gl.FLOAT, false, 40, 0);
    gl.enableVertexAttribArray(L.aNor);
    gl.vertexAttribPointer(L.aNor, 3, gl.FLOAT, false, 40, 12);
    gl.enableVertexAttribArray(L.aCol);
    gl.vertexAttribPointer(L.aCol, 3, gl.FLOAT, false, 40, 24);
    gl.bindBuffer(gl.ARRAY_BUFFER, item.mesh.uvbo);
    gl.enableVertexAttribArray(L.aUv);
    gl.vertexAttribPointer(L.aUv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, item.mesh.ibo);
    gl.uniformMatrix4fv(L.uModel, false, item.model);
    gl.uniform2f(L.uUvOffset, (opts.uvOffset && opts.uvOffset[0]) || 0, (opts.uvOffset && opts.uvOffset[1]) || 0);
    gl.uniform1f(L.uUseTex, opts.tex ? 1 : 0);
    gl.uniform1f(L.uEmissive, opts.emissive ? 1 : 0);
    gl.uniform1f(L.uAlpha, opts.alpha === undefined ? 1 : opts.alpha);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, opts.tex || this.whiteTex);
    gl.uniform1i(L.uTex, 0);
    gl.drawElements(gl.TRIANGLES, item.mesh.count, gl.UNSIGNED_SHORT, 0);
  }
}

// --- procedural canvas textures (made at runtime, no image files) ---

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// A building facade: wall colour with a grid of windows, a share of them
// lit warm. The canvas border stays wall-coloured so a roof sampling the
// corner texel reads plain wall.
export function facadeTexture(renderer, wall, litRatio, rng) {
  const [c, ctx] = canvas2d(128, 256);
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, 128, 256);
  const cols = 6;
  const rows = 10;
  const ww = 128 / cols;
  const wh = 256 / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lit = rng() < litRatio;
      ctx.fillStyle = lit ? '#ffd27a' : '#202e3a';
      ctx.fillRect(col * ww + 6, r * wh + 7, ww - 12, wh - 14);
      if (lit) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(col * ww + 6, r * wh + 7, ww - 12, 4);
      }
    }
  }
  return renderer.textureFromCanvas(c);
}

// Asphalt with a dashed centre line running along V (the road direction).
export function roadTexture(renderer) {
  const [c, ctx] = canvas2d(128, 128);
  ctx.fillStyle = '#55555a';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 25; i += 1) {
    ctx.fillRect(Math.floor(Math.random() * 128), Math.floor(Math.random() * 128), 2, 2);
  }
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(61, 0, 6, 34);
  ctx.fillRect(61, 64, 6, 34);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(4, 0, 3, 128);
  ctx.fillRect(121, 0, 3, 128);
  return renderer.textureFromCanvas(c);
}

// Gentle waves for the ocean, scrolled by uvOffset at run time.
export function waterTexture(renderer) {
  const [c, ctx] = canvas2d(128, 128);
  ctx.fillStyle = '#1668a8';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i += 1) {
    ctx.beginPath();
    const y = 8 + i * 14;
    for (let x = 0; x <= 128; x += 8) {
      const yy = y + Math.sin((x / 128) * Math.PI * 2 + i) * 3;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  return renderer.textureFromCanvas(c);
}
