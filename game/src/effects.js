// Cheap particle effects on one THREE.Points pool: muzzle flashes, sparks,
// smoke puffs and explosions, plus fading tracer lines for gunfire.
import * as THREE from 'three';

const MAX_PARTICLES = 420;

export function createEffects(G) {
  const { scene } = G;
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const particles = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    particles.push({ alive: false, life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, size: 1 });
    positions[i * 3 + 1] = -100;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.55, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  const tracers = [];
  const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });

  function spawn(pos, color, count, speed, up, life) {
    const c = new THREE.Color(color);
    let spawned = 0;
    for (let i = 0; i < MAX_PARTICLES && spawned < count; i += 1) {
      const p = particles[i];
      if (p.alive) continue;
      p.alive = true;
      p.life = 0;
      p.maxLife = life * (0.6 + Math.random() * 0.7);
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y + 0.4;
      positions[i * 3 + 2] = pos.z;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      p.vx = Math.cos(a) * s;
      p.vz = Math.sin(a) * s;
      p.vy = up * (0.5 + Math.random());
      spawned += 1;
    }
    geometry.attributes.color.needsUpdate = true;
  }

  function burst(pos, color, count) {
    spawn(pos, color, count, 5, 2.5, 0.6);
  }

  function smoke(pos) {
    spawn(pos, 0x555555, 3, 1.2, 3.2, 1.6);
  }

  function muzzle(pos) {
    spawn(pos, 0xffe9a8, 6, 2, 1, 0.12);
  }

  function explosion(pos) {
    spawn(pos, 0xff7a1a, 40, 9, 6, 0.9);
    spawn(pos, 0x444444, 24, 3, 5, 1.8);
    spawn(pos, 0xffe9a8, 16, 12, 4, 0.4);
  }

  function tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, tracerMaterial.clone());
    line.userData.life = 0.09;
    scene.add(line);
    tracers.push(line);
  }

  function update(dt) {
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const p = particles[i];
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        positions[i * 3 + 1] = -100;
        continue;
      }
      p.vy -= 6 * dt;
      positions[i * 3] += p.vx * dt;
      positions[i * 3 + 1] += p.vy * dt;
      positions[i * 3 + 2] += p.vz * dt;
    }
    geometry.attributes.position.needsUpdate = true;
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      const line = tracers[i];
      line.userData.life -= dt;
      line.material.opacity = Math.max(0, line.userData.life / 0.09) * 0.9;
      if (line.userData.life <= 0) {
        scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
        tracers.splice(i, 1);
      }
    }
  }

  return { burst, smoke, muzzle, explosion, tracer, update };
}
