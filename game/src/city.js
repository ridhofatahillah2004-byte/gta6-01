// Vista Mar, the city itself. Everything here is deterministic: the same
// seed always builds the same streets, blocks, park, beach and skyline.
// The builder returns the static draw list, the collision boxes, the
// ground-height function and the road graph the traffic AI drives on.
import { WORLD, PALETTE, LANDMARKS, SEED } from './config.js';
import { makeStream, clamp } from './rng.js';
import { makeBox, makeGround, makePanel, makePrism, makeCone, facadeTexture, roadTexture, waterTexture } from './render3d.js';
import { identity, model, multiply, rotationY, translation } from './mat4.js';

const GRID = [-160, -120, -80, -40, 0, 40, 80, 120, 160];

function textTexture(renderer, text, fg, bg, font) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = fg;
  ctx.font = font || 'bold 34px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  return renderer.textureFromCanvas(c);
}

export function buildCity(renderer) {
  const rng = makeStream(SEED);
  const drawables = []; // { mesh, model, opts }
  const colliders = []; // { minX, maxX, minZ, maxZ }
  const animated = []; // { mesh, model, opts, kind } — updated per frame
  const meshes = new Map();
  const getMesh = (key, make) => {
    if (!meshes.has(key)) meshes.set(key, renderer.mesh(make()));
    return meshes.get(key);
  };

  const addBox = (w, h, d, color, x, y, z, yaw, opts, uvScale) => {
    const key = `box|${w}|${h}|${d}|${color}|${uvScale || 0}`;
    const mesh = getMesh(key, () => makeBox(w, h, d, color, uvScale || 0));
    drawables.push({ mesh, model: model(x, y, z, yaw || 0, 0), opts: opts || {} });
    return mesh;
  };
  const addGround = (w, d, color, x, z, y, opts, uvScale) => {
    const key = `gnd|${w}|${d}|${color}|${uvScale || 0}`;
    const mesh = getMesh(key, () => makeGround(w, d, color, uvScale || 0));
    drawables.push({ mesh, model: model(x, y || 0, z, 0, 0), opts: opts || {} });
    return mesh;
  };
  const addCollider = (cx, cz, hw, hd) => {
    colliders.push({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd });
  };

  // --- textures (procedural, made once) ---
  // The facade textures draw from their own stream: tweaking a texture
  // must never reshuffle the buildings that come after them.
  const texRng = makeStream(SEED + 77);
  const facadeTex = facadeTexture(renderer, '#cbb89a', 0.45, texRng.next);
  const facadeBright = facadeTexture(renderer, '#8fa3b5', 0.7, texRng.next);
  const roadTex = roadTexture(renderer);
  const waterTex = waterTexture(renderer);

  // --- base ground: sidewalk grey, then roads, park, sand, ocean ---
  addGround(440, 440, PALETTE.sidewalk, 0, 0, -0.05, {});
  addGround(120, 120, PALETTE.grass, -100, -100, 0.0, {}); // park lawn (120x120 over the park blocks)
  // Roads: vertical and horizontal, dark asphalt with dashes.
  for (const gx of GRID) {
    addGround(10, 368, PALETTE.asphalt, gx, -16, 0.02, { tex: roadTex }, 46);
  }
  for (const gz of GRID) {
    const m = getMesh('gnd|10|368|road', () => makeGround(10, 368, PALETTE.asphalt, 46));
    drawables.push({ mesh: m, model: multiply(model(0, 0.02, gz, 0, 0), rotationY(Math.PI / 2)), opts: { tex: roadTex } });
  }
  // Beach sand and ocean.
  addGround(440, 34, PALETTE.sand, 0, 184, 0.03, {});
  const oceanMesh = getMesh('gnd|440|240|ocean', () => makeGround(440, 240, PALETTE.ocean, 30));
  const oceanModel = model(0, -0.4, 320, 0, 0);
  // The ocean lives in `animated` only: its wave texture scrolls each frame.
  animated.push({ mesh: oceanMesh, model: oceanModel, opts: { tex: waterTex }, kind: 'water' });

  // --- park: pond, paths, trees, benches ---
  const park = { x0: -160, x1: -40, z0: -160, z1: -40 };
  addGround(60, 34, [0.15, 0.42, 0.62], -100, -100, 0.04, {}); // the pond
  addGround(8, 116, [0.72, 0.68, 0.58], -100, -100, 0.05, {}); // park paths
  addGround(116, 8, [0.72, 0.68, 0.58], -100, -100, 0.05, {});
  const treeTrunk = getMesh('prism-tree', () => makePrism(0.35, 2.2, 6, [0.35, 0.22, 0.12]));
  const treeTop = getMesh('box-tree', () => makeBox(3.4, 2.6, 3.4, [0.16, 0.42, 0.18], 0));
  for (let i = 0; i < 26; i += 1) {
    const tx = -155 + rng.range(0, 110);
    const tz = -155 + rng.range(0, 110);
    if (Math.abs(tx + 100) < 34 && Math.abs(tz + 100) < 22) continue; // keep the pond clear
    if (Math.abs(tx + 100) < 6 || Math.abs(tz + 100) < 6) continue; // keep paths clear
    drawables.push({ mesh: treeTrunk, model: model(tx, 1.1, tz, 0, 0), opts: {} });
    drawables.push({ mesh: treeTop, model: model(tx, 3.4, tz, rng.range(0, 3), 0), opts: {} });
    addCollider(tx, tz, 0.5, 0.5);
  }
  for (let i = 0; i < 4; i += 1) {
    addBox(2.4, 0.5, 0.8, [0.5, 0.32, 0.18], -128 + i * 18, 0.25, -72, 0, {});
  }

  // --- buildings: one or two per block, seeded heights, lit windows ---
  const landmarkPlots = new Set(['-180,-180', '140,-120', '40,120', '80,-40', '120,40', '150,190', '-160,140', '-120,80']);
  const isParkBlock = (bx, bz) => bx >= -160 && bx < -40 && bz >= -160 && bz < -40;
  for (let ix = 0; ix < GRID.length - 1; ix += 1) {
    for (let iz = 0; iz < GRID.length - 1; iz += 1) {
      const bx = GRID[ix] + 5;
      const bz = GRID[iz] + 5;
      const cx = bx + 15;
      const cz = bz + 15;
      if (isParkBlock(bx, bz)) continue;
      if (bz >= 160) continue; // beach row stays open
      if (landmarkPlots.has(`${cx},${cz}`)) continue;
      if (cx === 15 && cz === 15) continue; // central plaza stays open
      const h = rng.range(8, 34);
      const w = rng.range(13, 24);
      const d = rng.range(13, 24);
      const ox = rng.range(-3, 3);
      const oz = rng.range(-3, 3);
      const tex = rng.chance(0.3) ? facadeBright : facadeTex;
      const key = `bld|${w.toFixed(1)}|${h.toFixed(1)}|${d.toFixed(1)}`;
      // One facade tile per ~28 units of height, so windows stay window-sized.
      const mesh = getMesh(key, () => makeBox(w, h, d, PALETTE.building, Math.max(0.3, h / 28)));
      drawables.push({ mesh, model: model(cx + ox, h / 2, cz + oz, 0, 0), opts: { tex } });
      addCollider(cx + ox, cz + oz, w / 2, d / 2);
      if (rng.chance(0.5)) {
        addBox(3, 1.2, 2.4, [0.45, 0.45, 0.48], cx + ox + rng.range(-4, 4), h + 0.6, cz + oz + rng.range(-4, 4), 0, {});
      }
    }
  }

  // --- central plaza: fountain basin + statue ---
  addGround(30, 30, [0.68, 0.66, 0.6], 15, 15, 0.06, {});
  addBox(8, 1, 8, [0.3, 0.5, 0.65], 15, 0.5, 15, 0, {});
  addBox(1.6, 5, 1.6, [0.85, 0.8, 0.65], 15, 3.5, 15, 0, {});
  addCollider(15, 15, 4, 4);

  // --- skyline ring: tall towers along the north and east edges ---
  for (let i = 0; i < 9; i += 1) {
    const tx = -180 + i * 42 + rng.range(-6, 6);
    const th = rng.range(45, 92);
    const tw = rng.range(16, 24);
    const key = `twr|${tw.toFixed(1)}|${th.toFixed(1)}`;
    const mesh = getMesh(key, () => makeBox(tw, th, tw, [0.55, 0.6, 0.68], Math.max(0.5, th / 28)));
    drawables.push({ mesh, model: model(tx, th / 2, -188, 0, 0), opts: { tex: facadeBright } });
    addCollider(tx, -188, tw / 2, tw / 2);
  }
  for (let i = 0; i < 6; i += 1) {
    const tz = -160 + i * 42 + rng.range(-6, 6);
    const th = rng.range(40, 80);
    const tw = rng.range(16, 24);
    const key = `twr2|${tw.toFixed(1)}|${th.toFixed(1)}`;
    const mesh = getMesh(key, () => makeBox(tw, th, tw, [0.6, 0.62, 0.66], Math.max(0.5, th / 28)));
    drawables.push({ mesh, model: model(188, th / 2, tz, 0, 0), opts: { tex: facadeBright } });
    addCollider(188, tz, tw / 2, tw / 2);
  }

  // --- landmarks ---
  // 1. Vista Tower, the tallest, with a spire.
  addBox(26, 112, 26, [0.62, 0.66, 0.74], -178, 56, -178, 0, { tex: facadeBright }, 4);
  addCollider(-178, -178, 13, 13);
  const spire = getMesh('cone-spire', () => makeCone(3, 18, 8, [0.8, 0.82, 0.86]));
  drawables.push({ mesh: spire, model: model(-178, 112, -178, 0, 0), opts: {} });
  // 2. Marina Pier: wooden deck over the water, posts, end platform, shack.
  for (let z = WORLD.pierZ0; z < WORLD.pierZ1; z += 4) {
    addBox(8, 0.5, 4, [0.55, 0.4, 0.24], WORLD.pierX, WORLD.pierDeckY, z + 2, 0, {});
  }
  addBox(16, 0.5, 16, [0.55, 0.4, 0.24], WORLD.pierX, WORLD.pierDeckY, 256, 0, {});
  addBox(5, 3.4, 4, [0.7, 0.62, 0.5], WORLD.pierX - 4, WORLD.pierDeckY + 1.7, 256, 0, {});
  addCollider(96, 256, 4, 3);
  for (let z = 176; z < 260; z += 14) {
    const post = getMesh('prism-post', () => makePrism(0.4, 3, 6, [0.4, 0.3, 0.18]));
    drawables.push({ mesh: post, model: model(95.5, -0.8, z, 0, 0), opts: {} });
    drawables.push({ mesh: post, model: model(104.5, -0.8, z, 0, 0), opts: {} });
  }
  // 3. Solmar Stadium: wide low arena with floodlights.
  const arena = getMesh('prism-arena', () => makePrism(26, 12, 12, [0.75, 0.72, 0.68]));
  drawables.push({ mesh: arena, model: model(140, 6, -120, 0, 0), opts: {} });
  addCollider(140, -120, 24, 24);
  const bowl = getMesh('prism-bowl', () => makePrism(20, 3, 12, [0.2, 0.45, 0.25]));
  drawables.push({ mesh: bowl, model: model(140, 13, -120, 0, 0), opts: {} });
  for (const [fx, fz] of [[116, -144], [164, -144], [116, -96], [164, -96]]) {
    addBox(0.8, 18, 0.8, [0.4, 0.4, 0.42], fx, 9, fz, 0, {});
    addBox(4, 2, 0.6, [1, 1, 1], fx, 18, fz, 0, { emissive: true });
  }
  // 4. The Palms Casino: gold block, palm trees, neon sign.
  addBox(26, 16, 20, [0.85, 0.68, 0.25], 40, 8, 120, 0, {});
  addCollider(40, 120, 13, 10);
  const palmsTex = textTexture(renderer, 'THE PALMS', '#ff5fa2', '#1c1030');
  const signMesh = getMesh('panel-palms', () => makePanel(20, 5, [1, 1, 1]));
  drawables.push({ mesh: signMesh, model: multiply(model(40, 17.5, 130.5, 0, 0), rotationY(0)), opts: { tex: palmsTex, emissive: true } });
  for (const [px, pz] of [[24, 108], [56, 108], [24, 132], [56, 132]]) {
    const trunk = getMesh('prism-palm', () => makePrism(0.4, 5, 6, [0.42, 0.3, 0.18]));
    drawables.push({ mesh: trunk, model: model(px, 2.5, pz, 0, 0), opts: {} });
    drawables.push({ mesh: treeTop, model: model(px, 6.2, pz, 0, 0), opts: {} });
  }
  // 5. Old Lighthouse: striped tower, lamp room, rotating beam.
  const lhWhite = getMesh('prism-lh-w', () => makePrism(3.4, 9, 10, [0.92, 0.9, 0.85]));
  const lhRed = getMesh('prism-lh-r', () => makePrism(3.0, 9, 10, [0.75, 0.2, 0.18]));
  drawables.push({ mesh: lhWhite, model: model(150, 4.5, 192, 0, 0), opts: {} });
  drawables.push({ mesh: lhRed, model: model(150, 13.5, 192, 0, 0), opts: {} });
  drawables.push({ mesh: lhWhite, model: model(150, 22.5, 192, 0, 0), opts: {} });
  const lampMesh = getMesh('box-lh-lamp', () => makeBox(4, 3, 4, [1, 0.95, 0.6], 0));
  drawables.push({ mesh: lampMesh, model: model(150, 28.5, 192, 0, 0), opts: { emissive: true } });
  addCollider(150, 192, 3.5, 3.5);
  const beamMesh = getMesh('panel-beam', () => makePanel(26, 2.4, [1, 0.95, 0.7]));
  const beamModel = model(150, 28.5, 192, 0, 0);
  // The beam lives in `animated` only: it sweeps around the lamp room.
  animated.push({ mesh: beamMesh, model: beamModel, opts: { alpha: 0.25 }, kind: 'beam', pivot: [150, 28.5, 192] });
  // 6. Vista Bank: stone front, four columns.
  addBox(22, 14, 16, [0.78, 0.74, 0.66], 80, 7, -40, 0, {});
  addCollider(80, -40, 11, 8);
  for (let i = 0; i < 4; i += 1) {
    const col = getMesh('prism-bank', () => makePrism(0.9, 12, 8, [0.9, 0.87, 0.8]));
    drawables.push({ mesh: col, model: model(72 + i * 5.4, 6, -31, 0, 0), opts: {} });
  }
  const bankTex = textTexture(renderer, 'VISTA BANK', '#22303c', '#d8cfb8');
  drawables.push({ mesh: signMesh, model: model(80, 15.5, -31.5, 0, 0), opts: { tex: bankTex } });
  // 7. General Hospital: white block, red cross.
  addBox(20, 12, 14, [0.92, 0.92, 0.9], 120, 6, 40, 0, {});
  addCollider(120, 40, 10, 7);
  const crossTex = textTexture(renderer, '+', '#d21f26', '#ffffff', 'bold 44px Arial, sans-serif');
  drawables.push({ mesh: signMesh, model: model(120, 13.5, 47.5, 0, 0), opts: { tex: crossTex } });

  // --- docks (west beach): crates and a warehouse ---
  addBox(18, 8, 12, [0.5, 0.48, 0.44], -150, 4, 138, 0, {});
  addCollider(-150, 138, 9, 6);
  for (const [cx, cz, cc] of [[-132, 128, [0.7, 0.4, 0.2]], [-128, 146, [0.2, 0.5, 0.6]], [-144, 152, [0.6, 0.6, 0.2]]]) {
    addBox(4, 4, 4, cc, cx, 2, cz, 0.4, {});
    addCollider(cx, cz, 2, 2);
  }
  // --- garage (west side) ---
  addBox(16, 6, 12, [0.55, 0.5, 0.45], -118, 3, 78, 0, {});
  addCollider(-118, 78, 8, 6);

  // --- street lamps along the main avenue ---
  const lampPole = getMesh('prism-lamp', () => makePrism(0.18, 6, 6, [0.25, 0.25, 0.28]));
  const lampHead = getMesh('box-lamp', () => makeBox(1.4, 0.5, 0.6, [1, 0.9, 0.6], 0));
  for (const lx of [-160, -80, 0, 80, 160]) {
    drawables.push({ mesh: lampPole, model: model(lx + 6, 3, 40, 0, 0), opts: {} });
    drawables.push({ mesh: lampHead, model: model(lx + 6, 6.2, 40, 0, 0), opts: { emissive: true } });
    drawables.push({ mesh: lampPole, model: model(lx - 6, 3, -40, 0, 0), opts: {} });
    drawables.push({ mesh: lampHead, model: model(lx - 6, 6.2, -40, 0, 0), opts: { emissive: true } });
  }

  // --- palms along the beachfront avenue ---
  for (let px = -180; px <= 180; px += 30) {
    if (Math.abs(px - 100) < 12) continue; // leave the pier mouth clear
    const trunk = getMesh('prism-palm2', () => makePrism(0.4, 5, 6, [0.42, 0.3, 0.18]));
    drawables.push({ mesh: trunk, model: model(px, 2.5, 164, 0, 0), opts: {} });
    drawables.push({ mesh: treeTop, model: model(px, 6.2, 164, 0, 0), opts: {} });
    addCollider(px, 164, 0.5, 0.5);
  }

  const groundHeight = (x, z) => {
    if (x > 94 && x < 106 && z >= WORLD.pierZ0 && z <= WORLD.pierZ1) return WORLD.pierDeckY;
    return 0;
  };

  const blocked = (x, z) => {
    if (x < -198 || x > 198 || z < -198 || z > 264) return true;
    if (z > WORLD.seaZ && !(x > 94 && x < 106 && z <= WORLD.pierZ1)) return true; // open water
    return false;
  };

  const isRoad = (x, z) => {
    if (z >= WORLD.sandZ) return false;
    for (const g of GRID) {
      if (Math.abs(x - g) <= WORLD.roadHalfWidth) return true;
      if (Math.abs(z - g) <= WORLD.roadHalfWidth) return true;
    }
    return false;
  };

  // Resolve a circle (x, z, radius) against every building collider.
  // Returns the pushed-out position.
  const collide = (x, z, r) => {
    let px = x;
    let pz = z;
    for (const c of colliders) {
      const nx = clamp(px, c.minX, c.maxX);
      const nz = clamp(pz, c.minZ, c.maxZ);
      const dx = px - nx;
      const dz = pz - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          px = nx + (dx / d) * r;
          pz = nz + (dz / d) * r;
        } else {
          // Centre inside the box: push out along the smallest penetration.
          const pl = px - (c.minX - r);
          const pr = c.maxX + r - px;
          const pt = pz - (c.minZ - r);
          const pb = c.maxZ + r - pz;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) px = c.minX - r;
          else if (m === pr) px = c.maxX + r;
          else if (m === pt) pz = c.minZ - r;
          else pz = c.maxZ + r;
        }
      }
    }
    return [px, pz];
  };

  return {
    drawables,
    animated,
    colliders,
    groundHeight,
    blocked,
    isRoad,
    collide,
    streets: GRID,
    park,
    landmarks: LANDMARKS,
    spawn: {
      player: [0, 24], // middle of the avenue, so the opening camera looks straight up it
      cars: [[-160, 40], [0, -80], [80, 120], [-40, 160], [120, -40], [-120, -120], [40, 0], [160, 80], [-80, -160], [80, -160]],
      peds: [[-20, 20], [20, -20], [-60, 60], [60, -60], [-100, 20], [20, 100], [100, -20], [-20, -100], [140, 60], [-140, -60]],
    },
  };
}
