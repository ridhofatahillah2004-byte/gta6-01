// Vista Mar itself: streets, blocks, buildings, palms, lamps, the park, the
// beach and pier, plus the landmarks the story uses (bank, garage, docks,
// motel, safehouse). All art is procedural: boxes with canvas-painted facade
// textures, no external assets. Colliders are axis-aligned boxes.
import * as THREE from 'three';
import { WORLD, COLORS } from './config.js';

function makeFacadeTexture(rng, base) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, 128, 10);
  for (let y = 18; y < 248; y += 22) {
    for (let x = 10; x < 118; x += 20) {
      const lit = rng.chance(0.28);
      ctx.fillStyle = lit ? 'rgba(255, 214, 130, 0.95)' : 'rgba(20, 28, 40, 0.85)';
      ctx.fillRect(x, y, 12, 14);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeRoadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#33363d';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 200; i += 1) ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  ctx.fillStyle = '#d8c25a';
  ctx.fillRect(62, 8, 4, 40);
  ctx.fillRect(62, 80, 4, 40);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(4, 0, 3, 128);
  ctx.fillRect(121, 0, 3, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeSignTexture(text, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = fg;
  ctx.font = 'bold 34px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function hexCss(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

export function createWorld(G) {
  const { scene, rng } = G;
  const colliders = [];
  const landmarks = {};
  const roadLines = [];
  for (let c = WORLD.STREET_MIN; c <= WORLD.STREET_MAX; c += WORLD.STREET_STEP) roadLines.push(c);

  const facadeTextures = COLORS.buildingPalette.slice(0, 4).map((c) => makeFacadeTexture(rng, hexCss(c)));
  const facadeMaterials = facadeTextures.map((t) => new THREE.MeshLambertMaterial({ map: t }));
  const roadTexture = makeRoadTexture();
  const roadMaterial = new THREE.MeshLambertMaterial({ map: roadTexture });
  const sidewalkMaterial = new THREE.MeshLambertMaterial({ color: COLORS.sidewalk });
  const sandMaterial = new THREE.MeshLambertMaterial({ color: COLORS.sand });
  const grassMaterial = new THREE.MeshLambertMaterial({ color: COLORS.grass });
  const oceanMaterial = new THREE.MeshPhongMaterial({
    color: COLORS.ocean, transparent: true, opacity: 0.85, shininess: 120,
  });
  const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const leafMaterial = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
  const lampMaterial = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const lampGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });

  function addBox(w, h, d, x, y, z, material, parent = scene) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = h > 2;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function addCollider(x, z, hw, hd) {
    colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  }

  // Ground: grass base, sand beach, ocean plane.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), grassMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  ground.receiveShadow = true;
  scene.add(ground);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(160, 500), sandMaterial);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(WORLD.BEACH_X + 55, 0, 0);
  sand.receiveShadow = true;
  scene.add(sand);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(320, 560, 48, 48), oceanMaterial);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(WORLD.OCEAN_X + 130, 0.4, 0);
  scene.add(ocean);
  G.ocean = ocean;

  // Roads: one plane per street, texture repeated along its length. The plane
  // is built long in the street's own direction so the dashed centre line
  // runs along the road, never across it.
  for (const c of roadLines) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(horizontal ? 470 : WORLD.ROAD_WIDTH, horizontal ? WORLD.ROAD_WIDTH : 470),
        roadMaterial.clone(),
      );
      road.material.map = roadTexture.clone();
      road.material.map.repeat.set(horizontal ? 9 : 1, horizontal ? 1 : 9);
      road.material.map.needsUpdate = true;
      road.rotation.x = -Math.PI / 2;
      road.position.set(horizontal ? 0 : c, 0.02, horizontal ? c : 0);
      road.receiveShadow = true;
      scene.add(road);
    }
  }

  // Sidewalk strips along every street edge.
  const sidewalkGeo = new THREE.PlaneGeometry(470, 4);
  for (const c of roadLines) {
    for (const off of [-7, 7]) {
      for (const horizontal of [true, false]) {
        const walk = new THREE.Mesh(sidewalkGeo, sidewalkMaterial);
        walk.rotation.x = -Math.PI / 2;
        walk.rotation.z = horizontal ? 0 : Math.PI / 2;
        walk.position.set(horizontal ? 0 : c + off, 0.03, horizontal ? c + off : 0);
        walk.receiveShadow = true;
        scene.add(walk);
      }
    }
  }

  function addPalm(x, z) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 5.5, 6), trunkMaterial);
    trunk.position.y = 2.75;
    trunk.castShadow = true;
    group.add(trunk);
    for (let i = 0; i < 6; i += 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 4), leafMaterial);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.1, 5.6, Math.sin(a) * 1.1);
      leaf.rotation.set(Math.sin(a) * 1.1, 0, Math.cos(a) * 1.1 + 0.5);
      group.add(leaf);
    }
    group.position.set(x, 0, z);
    scene.add(group);
  }

  function addLamp(x, z) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6), lampMaterial);
    pole.position.set(x, 3, z);
    scene.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), lampGlowMaterial);
    bulb.position.set(x, 6.1, z);
    scene.add(bulb);
  }

  function addLandmark(name, bx, bz, color, signText) {
    const base = addBox(26, 10, 20, bx, 5, bz, new THREE.MeshLambertMaterial({ color }));
    addCollider(bx, bz, 13, 10);
    const roof = addBox(28, 1, 22, bx, 10.5, bz, new THREE.MeshLambertMaterial({ color: 0x2c2c34 }));
    roof.castShadow = true;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 4),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(signText, '#11131a', '#ffd24a') }),
    );
    sign.position.set(bx, 12.5, bz + 10.2);
    scene.add(sign);
    landmarks[name] = { x: bx, z: bz, mesh: base };
    return { x: bx, z: bz };
  }

  // Landmark blocks (their blocks hold no random buildings).
  const landmarkBlocks = new Set(['-125,125', '125,-125', '175,175', '-175,-75', '-175,175']);
  addLandmark('garage', -125, 125, 0x8a5a2b, 'GARAGE');
  addLandmark('bank', 125, -125, 0x3a5a8a, 'BANK');
  addLandmark('docks', 175, 175, 0x5a7a3a, 'DOCKS');
  addLandmark('motel', -175, -75, 0x8a3a6a, 'MOTEL');
  addLandmark('safehouse', -175, 175, 0x3a8a7a, 'SAFEHOUSE');

  // Random buildings on the remaining blocks.
  for (let bx = -175; bx <= 175; bx += 50) {
    for (let bz = -175; bz <= 175; bz += 50) {
      const key = `${bx},${bz}`;
      if (landmarkBlocks.has(key)) continue;
      if (bx === 25 && bz === 25) continue; // central park
      const count = rng.int(1, 3);
      for (let i = 0; i < count; i += 1) {
        const w = rng.range(11, 20);
        const d = rng.range(11, 20);
        const h = rng.range(8, rng.chance(0.22) ? 46 : 22);
        const x = bx + rng.range(-9, 9);
        const z = bz + rng.range(-9, 9);
        const mat = facadeMaterials[rng.int(0, facadeMaterials.length - 1)];
        const mesh = addBox(w, h, d, x, h / 2, z, mat);
        mesh.rotation.y = rng.chance(0.5) ? 0 : Math.PI / 2;
        addCollider(x, z, Math.max(w, d) / 2 + 0.5, Math.max(w, d) / 2 + 0.5);
      }
    }
  }

  // Central park: grass, trees, a pond.
  const park = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), grassMaterial);
  park.rotation.x = -Math.PI / 2;
  park.position.set(25, 0.04, 25);
  scene.add(park);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(7, 24), oceanMaterial);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(25, 0.06, 25);
  scene.add(pond);
  for (let i = 0; i < 10; i += 1) addPalm(25 + rng.range(-18, 18), 25 + rng.range(-18, 18));

  // Palms along the beach and the main avenue; lamps at intersections.
  for (let z = -200; z <= 200; z += 50) addPalm(WORLD.BEACH_X - 4, z);
  for (let x = -175; x <= 175; x += 50) addPalm(x + 12, -175 + 12);
  for (const c of roadLines) {
    for (const d of roadLines) {
      if (Math.abs(c) <= 200 && Math.abs(d) <= 200) addLamp(c + 7, d + 7);
    }
  }

  // Pier reaching into the ocean.
  const pier = addBox(6, 1, 90, WORLD.BEACH_X + 70, 0.6, 150, new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
  pier.receiveShadow = true;
  addCollider(WORLD.BEACH_X + 70, 150, 3, 45);

  // Distant skyline silhouettes for depth.
  const skylineMat = new THREE.MeshLambertMaterial({ color: 0x5a6a7a });
  for (let i = 0; i < 26; i += 1) {
    const a = (i / 26) * Math.PI * 2;
    const r = rng.range(330, 420);
    const h = rng.range(30, 90);
    addBox(rng.range(18, 30), h, rng.range(18, 30), Math.cos(a) * r, h / 2, Math.sin(a) * r, skylineMat);
  }

  // Push a circle (player or car) out of every building collider it overlaps.
  function resolveCircle(pos, radius) {
    for (const c of colliders) {
      const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          pos.x = nx + (dx / d) * radius;
          pos.z = nz + (dz / d) * radius;
        } else {
          pos.x = c.maxX + radius;
        }
      }
    }
  }

  function nearestRoadCoord(v) {
    return Math.round(v / WORLD.STREET_STEP) * WORLD.STREET_STEP;
  }

  return {
    colliders,
    landmarks,
    roadLines,
    resolveCircle,
    nearestRoadCoord,
    update(dt, time) {
      // Gentle ocean swell: the water plane's vertices rise and fall.
      const pos = ocean.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        pos.setZ(i, Math.sin(x * 0.08 + time * 1.1) * 0.35 + Math.cos(y * 0.06 + time * 0.8) * 0.3);
      }
      pos.needsUpdate = true;
      ocean.geometry.computeVertexNormals();
    },
  };
}
