// Vista Mar (SOLMAR) — shared constants: city layout, tuning, colours, keys.
// The game is an original open-world crime game: fictional sun-soaked coastal
// city "Vista Mar", driver "Rook", fixer "Mara Voss". Nothing from any GTA game.
export const WORLD = {
  /** Streets sit on this grid; blocks are the squares between them. */
  STREET_STEP: 50,
  STREET_MIN: -200,
  STREET_MAX: 200,
  ROAD_WIDTH: 10,
  BLOCK: 40,
  /** Beach starts east of this x; the ocean plane covers the rest. */
  BEACH_X: 225,
  OCEAN_X: 260,
  CITY_RADIUS: 235,
};

export const PLAYER = {
  WALK_SPEED: 5.2,
  SPRINT_SPEED: 9.0,
  JUMP_SPEED: 7.5,
  RADIUS: 0.6,
  MAX_HEALTH: 100,
  START_CASH: 250,
  MAG_SIZE: 12,
  RELOAD_SECONDS: 1.2,
};

export const CAR = {
  LENGTH: 4.4,
  WIDTH: 2.0,
  RADIUS: 2.2,
  MAX_SPEED: 34,
  ACCEL: 16,
  BRAKE: 30,
  REVERSE_SPEED: 10,
  TURN_RATE: 2.1,
  TRAFFIC_SPEED: 9,
  MAX_HEALTH: 100,
};

export const WANTED = {
  /** Heat 0..100; stars = floor(heat / 20), capped at 5. */
  STEAL_CAR: 20,
  HIT_PED: 25,
  SHOOT: 15,
  KILL_COP: 20,
  DECAY_PER_SECOND: 2.2,
  QUIET_SECONDS: 10,
  MAX_STARS: 5,
};

export const POLICE = {
  CAR_TOP_SPEED: 36,
  OFFICER_RANGE: 28,
  OFFICER_DAMAGE: 8,
  OFFICER_SHOT_SECONDS: 0.9,
};

export const STEP = 1 / 60;
export const SAVE_KEY = 'solmar-save-v1';
export const BEST_KEY = 'solmar-best-v1';

export const COLORS = {
  sky: 0x8fc3e8,
  horizon: 0xf6d9a8,
  fog: 0xcfe0ee,
  sun: 0xffd9a0,
  asphalt: 0x33363d,
  sidewalk: 0x9a938a,
  sand: 0xe8d29a,
  ocean: 0x2e7fa8,
  grass: 0x5d9b4a,
  buildingPalette: [0xe8b48a, 0xd98a7a, 0x9ab8d9, 0xe8d28a, 0xb89ad9, 0x8ad9c0, 0xd9a0b8, 0xf0e0c0],
  carPalette: [0xc0392b, 0x2471a3, 0xf1c40f, 0x7d3c98, 0x1abc9c, 0xe67e22, 0x2c3e50, 0x95a5a6, 0xd35400],
  playerShirt: 0x2e86c1,
  policeCar: 0x1a1a22,
  policeLight: 0x2255ff,
  missionGold: 0xffc93c,
};

export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  enterCar: ['KeyE'],
  reload: ['KeyR'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
};
