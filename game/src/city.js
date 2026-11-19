// SOLMAR's city: roads, buildings, park, beach, ocean, pier, skyline.
// Everything is procedural — no image, model or font is loaded from disk.
import * as THREE from 'three';
import { WORLD, ROADS, LANDMARKS, PARK, BEACH, OCEAN, PIER, PALETTE, SEED } from './config.js';
import { makeRng } from './rng.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A facade of lit and dark windows, painted once and reused by many buildings. */
function windowTexture(rng) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#5a5148'; g.fillRect(0, 0, w, h);
    for (let y = 8; y < h - 12; y += 22) {
      for (let x = 8; x < w - 12; x += 18) {
        g.fillStyle = rng.chance(0.32) ? '#ffd98a' : '#202c3a';
        g.fillRect(x, y, 12, 15);
      }
    }
  });
}

function signTexture(text, bg, fg) {
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = 'bold 40px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

function roadTexture(vertical) {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#33363b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7d7d78';
    if (vertical) { g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h); }
    else { g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6); }
    g.fillStyle = '#e8e4d8';
    if (vertical) { for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 3, y + 8, 6, 34); }
    else { for (let x = 0; x < w; x += 64) g.fillRect(x + 8, h / 2 - 3, 34, 6); }
  });
}

function plankTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#8a6f4d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#6d5638';
    for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 2);
  });
}

/** 3D segment vs axis-aligned box: returns the hit fraction in [0,1], or 1 when clear. */
export function segmentVsBox(ax, ay, az, bx, by, bz, box) {
  let tmin = 0, tmax = 1;
  const d = [bx - ax, by - ay, bz - az];
  const o = [ax, ay, az];
  const mn = [box.minX, 0, box.minZ];
  const mx = [box.maxX, box.top, box.maxZ];
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return 1;
    } else {
      let t1 = (mn[i] - o[i]) / d[i];
      let t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return 1;
    }
  }
  return tmin;
}

export function buildCity(scene) {
  const rng = makeRng(SEED);
  const colliders = [];
  const solids = []; // building meshes, for the pistol raycast
  const group = new THREE.Group();
  scene.add(group);

  const winTex = [windowTexture(rng), windowTexture(rng), windowTexture(rng)];
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const plankTex = plankTexture();

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const addBox = (w, h, d, x, y, z, mat, parent = group) => {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = h > 4;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // --- ground, roads, sidewalks -------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2, WORLD.half * 2),
    new THREE.MeshLambertMaterial({ color: 0x8f8f84 }),
  );
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  group.add(ground);

  const roadTexH = roadTexture(false);
  roadTexH.wrapS = THREE.RepeatWrapping; roadTexH.wrapT = THREE.RepeatWrapping;
  roadTexH.repeat.set(14, 1);
  const roadTexV = roadTexture(true);
  roadTexV.wrapS = THREE.RepeatWrapping; roadTexV.wrapT = THREE.RepeatWrapping;
  roadTexV.repeat.set(1, 14);
  for (const r of ROADS) {
    const alongX = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.half * 2, WORLD.roadWidth),
      new THREE.MeshLambertMaterial({ map: roadTexH }),
    );
    alongX.rotation.x = -Math.PI / 2;
    alongX.position.set(0, 0.02, r);
    alongX.receiveShadow = true;
    group.add(alongX);
    const alongZ = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.roadWidth, WORLD.half * 2),
      new THREE.MeshLambertMaterial({ map: roadTexV }),
    );
    alongZ.rotation.x = -Math.PI / 2;
    alongZ.position.set(r, 0.02, 0);
    alongZ.receiveShadow = true;
    group.add(alongZ);
    // Sidewalk strips along both edges of both roads.
    for (const s of [-1, 1]) {
      addBox(WORLD.half * 2, 0.12, 2.6, 0, 0.06, r + s * (WORLD.roadWidth / 2 + 1.4), walkMat).castShadow = false;
      addBox(2.6, 0.12, WORLD.half * 2, r + s * (WORLD.roadWidth / 2 + 1.4), 0.06, 0, walkMat).castShadow = false;
    }
  }

  // --- park (north-west): grass, pond, trees -------------------------------
  const parkMat = new THREE.MeshLambertMaterial({ color: PALETTE.grass });
  const park = new THREE.Mesh(new THREE.PlaneGeometry(PARK.x1 - PARK.x0, PARK.z1 - PARK.z0), parkMat);
  park.rotation.x = -Math.PI / 2;
  park.position.set((PARK.x0 + PARK.x1) / 2, 0.05, (PARK.z0 + PARK.z1) / 2);
  park.receiveShadow = true;
  group.add(park);
  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(PARK.pond.r, 28),
    new THREE.MeshPhongMaterial({ color: 0x2a7ab8, shininess: 120, transparent: true, opacity: 0.92 }),
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(PARK.pond.x, 0.08, PARK.pond.z);
  group.add(pond);

  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 6);
  const leafGeo = new THREE.ConeGeometry(2.6, 6, 7);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6d4c2f });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7d33 });
  const tree = (x, z, s = 1) => {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 1.5; trunk.castShadow = true;
    const leaves = new THREE.Mesh(leafGeo, leafMat); leaves.position.y = 5.2; leaves.castShadow = true;
    t.add(trunk, leaves);
    t.position.set(x, 0, z); t.scale.setScalar(s);
    group.add(t);
  };
  for (let i = 0; i < 34; i += 1) {
    const x = rng.range(PARK.x0 + 8, PARK.x1 - 8);
    const z = rng.range(PARK.z0 + 8, PARK.z1 - 8);
    if (Math.hypot(x - PARK.pond.x, z - PARK.pond.z) < PARK.pond.r + 6) continue;
    tree(x, z, rng.range(0.8, 1.5));
  }
  for (let i = 0; i < 12; i += 1) {
    tree(rng.range(-200, 200), rng.pick([-207, 207, -163, 163]) + rng.range(-4, 4), rng.range(0.7, 1.1));
  }

  // --- beach, ocean, pier (south edge) -------------------------------------
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2, BEACH.z1 - BEACH.z0),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.06, (BEACH.z0 + BEACH.z1) / 2);
  sand.receiveShadow = true;
  group.add(sand);
  const oceanGeo = new THREE.PlaneGeometry(WORLD.half * 2 + 80, OCEAN.z1 - OCEAN.z0, 24, 12);
  const oceanMat = new THREE.MeshPhongMaterial({ color: PALETTE.ocean, shininess: 140, transparent: true, opacity: 0.94 });
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.12, (OCEAN.z0 + OCEAN.z1) / 2);
  group.add(ocean);
  const oceanBase = oceanGeo.attributes.position.array.slice();
  // Pier: deck, posts, end shack.
  const pierMat = new THREE.MeshLambertMaterial({ map: plankTex });
  addBox(PIER.width, 0.5, PIER.z1 - PIER.z0, PIER.x, 0.5, (PIER.z0 + PIER.z1) / 2, pierMat);
  const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 3, 6);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x5d4a30 });
  for (let z = PIER.z0 + 6; z < PIER.z1; z += 14) {
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(postGeo, postMat);
      p.position.set(PIER.x + s * (PIER.width / 2 - 0.4), -0.6, z);
      group.add(p);
    }
  }
  addBox(7, 4, 6, PIER.x, 2.5, PIER.z1 - 5, new THREE.MeshLambertMaterial({ color: 0xc2a878 }));
  // Beach umbrellas.
  for (const [ux, uz, col] of [[-40, 208, 0xd85a5a], [30, 210, 0x5a8fd8], [90, 206, 0xf2d05a]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), postMat);
    pole.position.set(ux, 1.5, uz); group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.1, 8), new THREE.MeshLambertMaterial({ color: col }));
    top.position.set(ux, 3.4, uz); top.castShadow = true; group.add(top);
  }

  // --- buildings ------------------------------------------------------------
  const winMats = winTex.map((t) => new THREE.MeshLambertMaterial({ map: t }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4a48 });
  const houseMats = [0xd8c8a8, 0xc2b49a, 0xb5a88f, 0xd0bfa5].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const cellOf = (i) => ({ x0: ROADS[i] + WORLD.roadWidth / 2 + 1.6, x1: ROADS[i + 1] - WORLD.roadWidth / 2 - 1.6 });
  const addCollider = (x, z, w, d, top) => {
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top });
  };
  const building = (x, z, w, d, h, mat) => {
    const m = addBox(w, h, d, x, h / 2, z, mat);
    solids.push(m);
    addBox(w + 0.6, 0.5, d + 0.6, x, h + 0.25, z, roofMat).castShadow = false;
    addCollider(x, z, w, d, h);
    return m;
  };
  const inPark = (x, z) => x > PARK.x0 && x < PARK.x1 && z > PARK.z0 && z < PARK.z1;
  const downtown = (x, z) => Math.abs(x) <= 110 && Math.abs(z) <= 110;
  for (let i = 0; i < ROADS.length - 1; i += 1) {
    for (let j = 0; j < ROADS.length - 1; j += 1) {
      const cx = cellOf(i), cz = cellOf(j);
      const mx = (cx.x0 + cx.x1) / 2, mz = (cz.x0 + cz.x1) / 2;
      if (inPark(mx, mz) || mz > BEACH.z0 - 4) continue;
      // Landmark cells get the landmark instead of random blocks.
      const lm = Object.values(LANDMARKS).find((L) => Math.abs(L.x - mx) < 24 && Math.abs(L.z - mz) < 24);
      if (lm) continue;
      const w = cx.x1 - cx.x0, d = cz.x1 - cz.x0;
      if (downtown(mx, mz)) {
        const n = rng.int(1, 2);
        for (let k = 0; k < n; k += 1) {
          const bw = rng.range(11, Math.min(18, w - 2));
          const bd = rng.range(11, Math.min(18, d - 2));
          const bx = mx + (n === 1 ? 0 : rng.range(-w / 4, w / 4));
          const bz = mz + (n === 1 ? 0 : rng.range(-d / 4, d / 4));
          building(bx, bz, bw, bd, rng.range(18, 54), rng.pick(winMats));
        }
      } else {
        const bw = rng.range(8, 12), bd = rng.range(8, 12);
        building(mx + rng.range(-3, 3), mz + rng.range(-3, 3), bw, bd, rng.range(5, 9), rng.pick(houseMats));
        // A garden shed beside some houses.
        if (rng.chance(0.4)) building(mx + rng.range(-8, 8), mz + rng.range(-8, 8), 3, 3, 2.6, rng.pick(houseMats));
      }
    }
  }

  // --- landmarks -------------------------------------------------------------
  const sign = (text, bg, fg, w, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w / 4),
      new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg) }),
    );
    m.position.set(x, y, z); m.rotation.y = ry;
    group.add(m);
  };
  // BANK: wide stone building, columns, gold sign.
  {
    const L = LANDMARKS.BANK;
    building(L.x, L.z, 26, 18, 16, new THREE.MeshLambertMaterial({ color: 0xcfc4a8 }));
    const colGeo = new THREE.CylinderGeometry(0.9, 1.1, 12, 8);
    const colMat = new THREE.MeshLambertMaterial({ color: 0xe8e0cc });
    for (const s of [-9, -3, 3, 9]) {
      const c = new THREE.Mesh(colGeo, colMat);
      c.position.set(L.x + s, 6, L.z + 9.6); c.castShadow = true; group.add(c);
    }
    sign('BANK', '#2c2416', '#ffd98a', 20, L.x, 18.5, L.z + 9.4);
    addCollider(L.x, L.z + 9.6, 22, 1.5, 12); // colonnade
  }
  // GARAGE: low hall, open front, car lot.
  {
    const L = LANDMARKS.GARAGE;
    building(L.x, L.z, 24, 16, 8, new THREE.MeshLambertMaterial({ color: 0x7d94a8 }));
    sign('GARAGE', '#16242e', '#9fd0ff', 18, L.x, 10, L.z + 8.4);
  }
  // DOCKS: warehouse + stacked containers.
  {
    const L = LANDMARKS.DOCKS;
    building(L.x, L.z, 26, 20, 11, new THREE.MeshLambertMaterial({ color: 0x8a7a68 }));
    const contCols = [0xb8542e, 0x2e6db8, 0x4d8a3f, 0xb8a12e];
    for (let i = 0; i < 6; i += 1) {
      const cx = L.x - 18 + (i % 3) * 9;
      const cz = L.z + 16 + Math.floor(i / 3) * 5;
      addBox(7.5, 2.6, 3.4, cx, 1.3 + (i > 2 ? 2.6 : 0), cz, new THREE.MeshLambertMaterial({ color: contCols[i % 4] }));
      addCollider(cx, cz, 7.5, 3.4, 2.6 + (i > 2 ? 2.6 : 0));
    }
    sign('DOCKS', '#241a12', '#ffb35a', 16, L.x, 13, L.z + 10.4);
  }
  // MOTEL: two floors, pink neon sign.
  {
    const L = LANDMARKS.MOTEL;
    building(L.x, L.z, 22, 14, 11, new THREE.MeshLambertMaterial({ color: 0xc2a878 }));
    const neon = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 3),
      new THREE.MeshBasicMaterial({ map: signTexture('MOTEL', '#3a0f28', '#ff7ad9') }),
    );
    neon.position.set(L.x, 12.5, L.z + 7.4); group.add(neon);
    const glow = new THREE.PointLight(0xff7ad9, 12, 26); glow.position.set(L.x, 12, L.z + 10); group.add(glow);
  }
  // SAFEHOUSE: small home, warm porch light.
  {
    const L = LANDMARKS.SAFEHOUSE;
    building(L.x, L.z, 11, 9, 6, new THREE.MeshLambertMaterial({ color: 0xa8b898 }));
    const porch = new THREE.PointLight(0xffd98a, 14, 22); porch.position.set(L.x, 3.4, L.z + 6); group.add(porch);
    sign('HOME', '#1c2a1c', '#cfe8b0', 8, L.x, 7.4, L.z + 4.8);
  }

  // --- skyline, sun, clouds ---------------------------------------------------
  // Distant towers wear the same lit-window facades as downtown, so the
  // horizon reads as a city instead of flat grey slabs.
  const skyMats = winTex.map((t) => new THREE.MeshBasicMaterial({ map: t, fog: false }));
  for (let i = 0; i < 26; i += 1) {
    const a = (i / 26) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const r = rng.range(280, 340);
    const h = rng.range(40, 95);
    const w = rng.range(18, 34);
    const m = new THREE.Mesh(boxGeo, rng.pick(skyMats));
    m.scale.set(w, h, w);
    m.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    group.add(m);
  }
  const sun = new THREE.Mesh(new THREE.CircleGeometry(22, 24), new THREE.MeshBasicMaterial({ color: 0xfff2cf, fog: false }));
  sun.position.set(-260, 190, -320); sun.lookAt(0, 0, 0);
  group.add(sun);
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const clouds = [];
  for (let i = 0; i < 8; i += 1) {
    const c = new THREE.Group();
    for (let k = 0; k < 3; k += 1) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rng.range(6, 11), 8, 6), cloudMat);
      s.position.set(k * 9 - 9, rng.range(-1, 1), rng.range(-3, 3));
      s.scale.y = 0.45;
      c.add(s);
    }
    c.position.set(rng.range(-260, 260), rng.range(90, 130), rng.range(-260, 260));
    group.add(c);
    clouds.push(c);
  }
  // Streetlights at downtown intersections.
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const [lx, lz] of [[-66, -66], [66, -66], [-66, 66], [66, 66], [-22, -22], [22, 22], [-110, 22], [110, -22], [-22, 110], [22, -110], [-154, -66], [154, 66]]) {
    const p = new THREE.Mesh(poleGeo, poleMat);
    p.position.set(lx, 3.5, lz); group.add(p);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampMat);
    lamp.position.set(lx, 7.1, lz); group.add(lamp);
  }

  // --- collision helpers ------------------------------------------------------
  function circleBlocked(x, z, r) {
    for (const b of colliders) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }
  function resolveCircle(p, r) {
    for (const b of colliders) {
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
      let dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r || d2 === 0) {
        if (d2 === 0) { p.x = b.maxX + r; }
        continue;
      }
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * r;
      p.z = cz + (dz / d) * r;
    }
    p.x = Math.max(-WORLD.half + 2, Math.min(WORLD.half - 2, p.x));
    p.z = Math.max(-WORLD.half + 2, Math.min(430, p.z));
  }
  function segmentClear(ax, ay, az, bx, by, bz) {
    let t = 1;
    for (const b of colliders) {
      const hit = segmentVsBox(ax, ay, az, bx, by, bz, b);
      if (hit < t) t = hit;
    }
    return t;
  }
  function randomSidewalkPoint() {
    const road = ROADS[Math.floor(rng.next() * ROADS.length)];
    const along = rng.range(-200, 200);
    const side = rng.chance(0.5) ? 1 : -1;
    const off = WORLD.roadWidth / 2 + 1.6;
    return rng.chance(0.5)
      ? { x: road + side * off, z: along }
      : { x: along, z: road + side * off };
  }

  let t = 0;
  return {
    colliders,
    solids,
    landmarks: LANDMARKS,
    circleBlocked,
    resolveCircle,
    segmentClear,
    randomSidewalkPoint,
    update(dt) {
      t += dt;
      // Gentle ocean swell: displace the plane's vertices with two sine waves.
      const pos = oceanGeo.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        const x = oceanBase[i * 3], y = oceanBase[i * 3 + 1];
        pos.setZ(i, Math.sin(x * 0.06 + t * 1.1) * 0.55 + Math.cos(y * 0.09 + t * 0.7) * 0.4);
      }
      pos.needsUpdate = true;
      oceanGeo.computeVertexNormals();
      for (const c of clouds) c.position.x += dt * 1.2;
    },
  };
}
