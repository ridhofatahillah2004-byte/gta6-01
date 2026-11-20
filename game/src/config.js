// SOLMAR: Streets of Vista Mar — shared tuning, layout and story data.
// Every number here is the single source of truth for the other modules:
// the city grid, the missions, the wanted system and the economy.
export const WORLD = {
  half: 200, // city spans x,z in [-200, 200]
  roadEvery: 40, // distance between street centrelines
  roadHalfWidth: 5, // half the width of a road
  blockSize: 30, // building block side (roadEvery - 2 * roadHalfWidth)
  seaZ: 200, // ocean starts here (south edge)
  sandZ: 168, // beach sand starts here
  pierX: 100, // pier centreline
  pierZ0: 168, // pier starts at the sand
  pierZ1: 262, // pier ends out over the water
  pierDeckY: 0.25,
};

// Sun-soaked late-afternoon palette for the whole game.
export const PALETTE = {
  sky: [0.62, 0.78, 0.92],
  fog: [0.98, 0.82, 0.62],
  sunDir: [0.45, 0.72, 0.35], // direction TO the sun (fragment shader uses it as the light vector)
  grass: [0.32, 0.62, 0.30],
  sand: [0.93, 0.82, 0.58],
  ocean: [0.10, 0.45, 0.72],
  asphalt: [0.92, 0.92, 0.94], // road tint: near-white so the asphalt texture shows at full strength (vertex colour multiplies the texture)
  sidewalk: [0.55, 0.53, 0.48],
  building: [0.82, 0.76, 0.68],
  glass: [0.45, 0.65, 0.80],
};

export const PLAYER = {
  walkSpeed: 7,
  runSpeed: 11,
  radius: 0.6,
  health: 100,
  startMoney: 250,
  startPos: [8, 0, 24],
};

export const CAR = {
  accel: 22,
  brake: 34,
  maxSpeed: 34,
  maxReverse: 10,
  steer: 1.9,
  grip: 6.5,
};

// Wanted heat 0..100. Stars are ceil(heat / 20), 0..5.
export const WANTED = {
  stealCar: 15,
  shoot: 8,
  hitPed: 25,
  hitPolice: 12,
  decayPerSec: 1.6,
  decayDelaySec: 8,
  policePerStar: [0, 1, 2, 3, 4, 5],
  policeSpeed: [0, 15, 18, 22, 26, 30],
};

// Mara Voss, the fixer who runs Vista Mar from a back office above the
// Palms Casino. Four jobs, each one bigger than the last.
export const MISSIONS = [
  {
    id: 0,
    name: 'First Errand',
    pay: 500,
    giver: 'Mara Voss',
    brief: 'A package is waiting at the docks. Pick it up and bring it to the Palms Casino. No trouble, no noise.',
    steps: [
      { kind: 'goto', label: 'Pick up the package at the docks', pos: [-160, 0, 138] },
      { kind: 'goto', label: 'Deliver the package to the Palms Casino', pos: [40, 0, 104] },
    ],
  },
  {
    id: 1,
    name: 'Getaway Driver',
    pay: 800,
    giver: 'Mara Voss',
    brief: 'A tuned coupe is parked by the stadium. Take it — loudly — and bring it to the garage on the west side. The cops will notice.',
    steps: [
      { kind: 'steal', label: 'Steal the marked coupe by the stadium', pos: [120, 0, -108], car: 'coupe' },
      { kind: 'goto', label: 'Deliver the coupe to the garage', pos: [-118, 0, 66], wanted: 40 },
    ],
  },
  {
    id: 2,
    name: 'The Collection',
    pay: 1200,
    giver: 'Mara Voss',
    brief: 'Three drops are waiting around the city. Collect them all before the trail goes cold — four minutes.',
    steps: [
      { kind: 'collect', label: 'Collect the drops (0/3)', pos: [-100, 0, -60], count: 3, timeLimit: 240 },
    ],
  },
  {
    id: 3,
    name: 'The Big Score',
    pay: 3000,
    giver: 'Mara Voss',
    brief: 'Vista Bank. One vault, one bag, four stars. Grab the cash and get to the hideout before the whole city closes in.',
    steps: [
      { kind: 'goto', label: 'Enter Vista Bank', pos: [80, 0, -26] },
      { kind: 'grab', label: 'Grab the vault cash', pos: [80, 0, -26] },
      { kind: 'goto', label: 'Escape to the hideout', pos: [-158, 0, -138], wanted: 80 },
    ],
  },
];

// Twelve cash stashes hidden around Vista Mar. Walk over one to take it.
export const STASHES = [
  { name: 'Park bench', pos: [-118, 0, -82] },
  { name: 'Pier end', pos: [100, 0, 256] },
  { name: 'Stadium gate', pos: [118, 0, -96] },
  { name: 'Lighthouse base', pos: [146, 0, 188] },
  { name: 'Casino alley', pos: [80, 0, 104] },
  { name: 'Bank alley', pos: [120, 0, -22] },
  { name: 'Docks crate', pos: [-160, 0, 122] },
  { name: 'Garage yard', pos: [-104, 0, 78] },
  { name: 'Beach towel', pos: [42, 0, 182] },
  { name: 'Tower plaza', pos: [-160, 0, -168] },
  { name: 'Market alley', pos: [-22, 0, 40] },
  { name: 'Hospital lot', pos: [120, 0, 58] },
];

export const LANDMARKS = [
  { name: 'Vista Tower', pos: [-178, 0, -178], kind: 'tower' },
  { name: 'Marina Pier', pos: [100, 0, 215], kind: 'pier' },
  { name: 'Solmar Stadium', pos: [140, 0, -120], kind: 'stadium' },
  { name: 'The Palms Casino', pos: [40, 0, 120], kind: 'casino' },
  { name: 'Old Lighthouse', pos: [150, 0, 192], kind: 'lighthouse' },
  { name: 'Vista Bank', pos: [80, 0, -40], kind: 'bank' },
  { name: 'General Hospital', pos: [120, 0, 40], kind: 'hospital' },
];

export const STASH_VALUE = 150;
export const SAVE_KEY = 'solmar-save-v1';
export const SEED = 20261120;
