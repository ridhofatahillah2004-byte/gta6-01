// SOLMAR: Streets of Vista Mar — shared tuning, layout and story data.
// Every number the game runs on lives here so the other modules stay small.
export const SEED = 20261119;

// The city is a grid of roads; blocks sit between them.
export const WORLD = {
  half: 220, // city spans x,z in [-220, 220]; ocean past z = 220
  roadGap: 44, // distance between neighbouring road centrelines
  roadWidth: 9,
  block: 35,
};

// Road centrelines, both directions.
export const ROADS = [-198, -154, -110, -66, -22, 22, 66, 110, 154, 198];

// Named places the missions and the minimap point at.
export const LANDMARKS = {
  BANK: { x: 44, z: -44, label: 'BANK', color: 0xd8b25a },
  GARAGE: { x: -176, z: 44, label: 'GARAGE', color: 0x5a8fd8 },
  DOCKS: { x: 154, z: 176, label: 'DOCKS', color: 0x8a6f4d },
  MOTEL: { x: 176, z: -88, label: 'MOTEL', color: 0xd85a8a },
  SAFEHOUSE: { x: -88, z: -176, label: 'SAFEHOUSE', color: 0x5ad88a },
};

// The park (north-west) and the beach + ocean (south edge).
export const PARK = { x0: -220, z0: -220, x1: -110, z1: -110, pond: { x: -165, z: -165, r: 26 } };
export const BEACH = { z0: 198, z1: 220 };
export const OCEAN = { z0: 220, z1: 460 };
export const PIER = { x: 0, z0: 198, z1: 300, width: 10 };

// Player, car and police tuning.
export const TUNING = {
  walkSpeed: 6,
  runSpeed: 10.5,
  playerRadius: 0.7,
  playerHealth: 100,
  carAccel: 16,
  carBrake: 30,
  carMaxSpeed: 34,
  carReverseMax: 10,
  carSteer: 0.55,
  trafficSpeed: 11,
  trafficCount: 9,
  pedCount: 14,
  heatDecay: 1.6, // per second while quiet
  heatStealCar: 25,
  heatShoot: 8,
  heatHitPed: 20,
  heatPickup: 20, // mission 3 pickup calls the police
  heatVault: 80, // mission 4 sets heat to this
  starsFor: (heat) => Math.min(5, Math.ceil(heat / 20)),
  policePerStar: 1,
  policeSpeed: 26,
  policeShootRange: 42,
  policeShotInterval: 1.4,
  policeShotDamage: 7,
  pistolMag: 12,
  pistolReload: 1.2,
  pistolRange: 90,
  stashValue: 100,
  bustedSeconds: 2, // a police car parked on the player on foot
};

// Mara Voss's four jobs. Each stage has a target place and a verb.
export const MISSIONS = [
  {
    id: 'wheels',
    title: 'Job 1 — First Wheels',
    brief: 'Mara Voss: "New in Vista Mar? Prove you can drive. Take any car and bring it to the GARAGE."',
    reward: 500,
    stages: [
      { verb: 'steal', text: 'Steal a car (walk up to one and press E)', target: null },
      { verb: 'goto', text: 'Drive to the GARAGE', target: 'GARAGE' },
    ],
  },
  {
    id: 'bankrun',
    title: 'Job 2 — Bank Run',
    brief: 'Mara Voss: "The BANK keeps a cash drawer by the door. Walk in, hold still, and walk out rich."',
    reward: 800,
    stages: [
      { verb: 'goto', text: 'Get to the BANK', target: 'BANK' },
      { verb: 'hold', text: 'Hold still inside the BANK (5s)', target: 'BANK', seconds: 5 },
      { verb: 'goto', text: 'Lose the heat — reach the MOTEL', target: 'MOTEL' },
    ],
  },
  {
    id: 'dockside',
    title: 'Job 3 — Dockside Drop',
    brief: 'Mara Voss: "A package is waiting at the DOCKS. Pick it up and run it to the SAFEHOUSE. The harbour police will not love it."',
    reward: 1200,
    stages: [
      { verb: 'goto', text: 'Pick up the package at the DOCKS', target: 'DOCKS' },
      { verb: 'goto', text: 'Deliver it to the SAFEHOUSE', target: 'SAFEHOUSE' },
    ],
  },
  {
    id: 'bigscore',
    title: 'Job 4 — The Big Score',
    brief: 'Mara Voss: "Tonight we take the BANK vault itself. Ten seconds inside, then run like the whole city is watching — because it will be."',
    reward: 3000,
    stages: [
      { verb: 'goto', text: 'Get to the BANK', target: 'BANK' },
      { verb: 'hold', text: 'Crack the vault — hold still inside (10s)', target: 'BANK', seconds: 10 },
      { verb: 'goto', text: 'Escape to the SAFEHOUSE', target: 'SAFEHOUSE' },
    ],
  },
];

// Twelve cash stashes, tucked on sidewalks and quiet corners.
export const STASH_SPOTS = [
  [-198, -198], [-22, -198], [110, -198], [198, -110], [198, 22], [110, 110],
  [-66, 154], [-198, 110], [-154, -22], [22, -110], [154, -66], [-110, 198],
];

export const SAVE_KEY = 'solmar-save-v1';

export const PALETTE = {
  sky: 0x8fc3e8,
  fog: 0xa8c8de,
  sun: 0xfff2cf,
  asphalt: 0x33363b,
  sidewalk: 0x9a9a92,
  grass: 0x5d9b4a,
  sand: 0xdcc28e,
  ocean: 0x2a7ab8,
  building: [0xb8a88f, 0x9fb0bd, 0xc2b49a, 0x8fa3b5, 0xd0c0a0, 0xa89a86],
  windowLit: 0xffd98a,
  windowDark: 0x2c3a4a,
};
