// Rendering: the WebGL renderer, the sun-soaked sky, the camera rig that
// follows the player on foot and in a car, and the ocean swell driver.
import * as THREE from 'three';
import { COLORS } from './config.js';

export function createRender(G) {
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.fog, 180, 520);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(0, 30, 60);

  // Golden-hour sun plus a soft sky fill.
  const sun = new THREE.DirectionalLight(COLORS.sun, 2.4);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9));

  // A warm gradient dome so the horizon never reads as flat grey.
  const skyGeo = new THREE.SphereGeometry(700, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x5fa8dd) },
      mid: { value: new THREE.Color(COLORS.sky) },
      bottom: { value: new THREE.Color(COLORS.horizon) },
    },
    vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vPos; uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; void main(){ float h = normalize(vPos).y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.65, h)) : mix(bottom, mid, smoothstep(-0.08, 0.12, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Sun disc + a few flat clouds for the title-screen backdrop.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false }),
  );
  sunDisc.position.set(320, 190, -420);
  sunDisc.lookAt(0, 40, 0);
  scene.add(sunDisc);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
  for (const [x, y, z, s] of [[-180, 150, -300, 42], [60, 180, -350, 55], [240, 140, -260, 36], [-40, 170, 320, 48]]) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cloudMat);
    cloud.scale.set(s, s * 0.32, s * 0.6);
    cloud.position.set(x, y, z);
    scene.add(cloud);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Camera state: orbit yaw/pitch around the player, smoothed.
  const rig = {
    yaw: 0,
    pitch: 0.32,
    distance: 8.5,
    height: 3.2,
    smoothed: new THREE.Vector3(0, 10, 40),
  };

  // 2D slab test: the first fraction t in (0, 1) where the segment from the
  // player to the wanted camera spot enters a building footprint, or null.
  // Buildings are all taller than the camera, so an XZ crossing means the
  // camera would be inside the facade.
  function segmentHitsBuilding(ax, az, bx, bz) {
    let best = null;
    for (const c of G.world.colliders) {
      const dx = bx - ax;
      const dz = bz - az;
      let tmin = 0;
      let tmax = 1;
      if (Math.abs(dx) < 1e-9) {
        if (ax < c.minX || ax > c.maxX) continue;
      } else {
        let t1 = (c.minX - ax) / dx;
        let t2 = (c.maxX - ax) / dx;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (Math.abs(dz) < 1e-9) {
        if (az < c.minZ || az > c.maxZ) continue;
      } else {
        let t1 = (c.minZ - az) / dz;
        let t2 = (c.maxZ - az) / dz;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (tmin > 0.02 && (best === null || tmin < best)) best = tmin;
    }
    return best;
  }

  function updateCamera(dt, lookDelta) {
    const player = G.player;
    rig.yaw += lookDelta.yaw;
    rig.pitch = THREE.MathUtils.clamp(rig.pitch + lookDelta.pitch, 0.05, 1.1);
    const inCar = !!player.car;
    const dist = inCar ? 11 : 8;
    const height = inCar ? 4.2 : 3.4;
    const anchor = player.car ? player.car.pos : player.pos;
    const heading = player.car ? player.car.angle : player.angle;
    // The camera trails behind the heading; the mouse orbits around it.
    const camYaw = heading + Math.PI + rig.yaw;
    let tx = anchor.x + Math.sin(camYaw) * Math.cos(rig.pitch) * dist;
    let tz = anchor.z + Math.cos(camYaw) * Math.cos(rig.pitch) * dist;
    let ty = anchor.y + height + Math.sin(rig.pitch) * dist * 0.6;
    // Never let the camera sink into a facade: pull it in just short of the
    // first building the line of sight would cross.
    const hit = segmentHitsBuilding(anchor.x, anchor.z, tx, tz);
    if (hit !== null) {
      const pull = Math.max(0.15, hit - 0.06);
      tx = anchor.x + (tx - anchor.x) * pull;
      tz = anchor.z + (tz - anchor.z) * pull;
      ty = anchor.y + (ty - anchor.y) * pull;
    }
    rig.smoothed.lerp(new THREE.Vector3(tx, ty, tz), 1 - Math.exp(-8 * dt));
    camera.position.copy(rig.smoothed);
    camera.lookAt(anchor.x, anchor.y + 1.6, anchor.z);
    // Face the player the way the camera looks when on foot.
    if (!inCar && (lookDelta.yaw !== 0 || lookDelta.pitch !== 0)) {
      player.angle = Math.atan2(
        camera.position.x - anchor.x,
        camera.position.z - anchor.z,
      ) + Math.PI;
    }
  }

  function setCamera(x, y, z, lookX, lookY, lookZ) {
    camera.position.set(x, y, z);
    camera.lookAt(lookX, lookY, lookZ);
    rig.smoothed.copy(camera.position);
  }

  return {
    renderer, scene, camera, rig, setCamera, updateCamera,
    render() {
      renderer.render(scene, camera);
    },
  };
}
