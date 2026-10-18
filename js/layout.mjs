// Pure deterministic city layout for Maybe Real City.
// No DOM, no three.js — safe to import from Node for tests.
import { RNG } from './rng.mjs';

export const SEED = 20261018;
export const LAUNCH_DATE_UTC = Date.UTC(2026, 9, 1); // Oct 1 2026
export const NEW_TODAY_SEED = 0x9e3779b9;

export const DISTRICTS = [
  { id: 'downtown',  name: 'Downtown',  street: 'Highrise Way',  color: '#e8b04b', anchor: { x: 0, z: -6 },  valueMin: 400, valueMax: 900 },
  { id: 'ringroad',  name: 'Ring Road',  street: 'Loop Lane',     color: '#e2725b', anchor: { x: 74, z: 0 },  valueMin: 250, valueMax: 600 },
  { id: 'riverside', name: 'Riverside',  street: 'Riverbend Row', color: '#4b9fe8', anchor: { x: 148, z: 0 }, valueMin: 300, valueMax: 700 },
  { id: 'oldtown',   name: 'Old Town',   street: 'Cobble Court',  color: '#9b7ede', anchor: { x: -110, z: 0 },valueMin: 150, valueMax: 450 },
];

export const LANDMARKS = [
  { id: 'townhall', name: 'Town Hall',   x: 0,    z: -34,  label: 'Town Hall' },
  { id: 'bank',     name: 'Town Bank',   x: 0,    z: 42,   label: 'Town Bank' },
  { id: 'fountain', name: 'Wishing Fountain', x: 0, z: 0,  label: 'Wishing Fountain' },
  { id: 'stadium',  name: 'Cloud Stadium', x: 105, z: -95, label: 'Cloud Stadium' },
  { id: 'skyport',  name: 'Skyport Tower', x: -115, z: 100,label: 'Skyport Tower' },
];

export const BODY_PALETTE = ['#FFF6E9', '#FFFFFF', '#FFE3C2', '#DFF5E1', '#DDEBF7', '#E8DFF5'];
export const ROOF_PALETTE = ['#C96F4A', '#E08E45', '#8A5A44', '#5B6B7A', '#7A9B6D'];

const ADJECTIVES = [
  'Amber','Breezy','Clover','Drowsy','Ember','Fern','Ginger','Honey','Ivy','Juniper',
  'Kooky','Lively','Maple','Mossy','Nifty','Oaty','Pebbly','Quaint','Rosy','Sunny',
  'Taffy','Velvet','Wobbly','Zesty','Brisk','Cloudy','Dandy','Eager','Fuzzy','Giddy',
  'Jolly','Kindly','Lucky','Merry','Nimble','Plucky','Snug','Tidy','Witty','Zippy',
];
const NOUNS = [
  'Acorn','Badger','Beaver','Bunny','Chipmunk','Duckling','Ferret','Fox','Frog','Hedgehog',
  'Heron','Jay','Kitten','Lark','Mole','Mouse','Newt','Otter','Owl','Panda',
  'Puppy','Quail','Rabbit','Raccoon','Robin','Sparrow','Squirrel','Turtle','Wren','Biscuit',
  'Button','Comet','Dumpling','Firefly','Marble','Noodle','Pickle','Sprout','Tulip','Waffle',
];

export function dayNumber(nowMs = Date.now()) {
  return Math.floor((nowMs - LAUNCH_DATE_UTC) / 86400000) + 1;
}

export function newTodayCount() {
  return new RNG(SEED ^ NEW_TODAY_SEED).int(3, 9);
}

// Build the full layout. Returns { plots, towers, trees, landmarks, districts, stats }.
export function buildLayout(seed = SEED) {
  const rng = new RNG(seed);
  const districts = DISTRICTS.map(d => ({ ...d }));
  const plots = [];
  const towers = [];

  const districtOf = id => districts.find(d => d.id === id);

  function addPlot(districtId, x, z, rot, open = false) {
    const d = districtOf(districtId);
    const id = 'p' + plots.length;
    plots.push({
      id,
      district: districtId,
      x: round2(x), z: round2(z), rot: round2(rot),
      open,
      resident: null, // filled below for houses
      number: rng.int(1, 999),
      street: d.street,
      value: rng.int(d.valueMin, d.valueMax),
      body: rng.int(0, BODY_PALETTE.length - 1),
      roof: rng.int(0, ROOF_PALETTE.length - 1),
    });
    return id;
  }

  // --- Ring Road: two rows of houses around the loop ---
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    addPlot('ringroad', Math.cos(a) * 74, Math.sin(a) * 74, -a + Math.PI / 2);
  }
  for (let i = 0; i < 45; i++) {
    const a = ((i + 0.5) / 45) * Math.PI * 2;
    addPlot('ringroad', Math.cos(a) * 88, Math.sin(a) * 88, -a + Math.PI / 2);
  }
  // --- Ring Road: outer row of open plots (claimable land) ---
  // Skips the west sector where Old Town sits (plots would overlap).
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + 0.1;
    let da = Math.abs(((a - Math.PI + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (da < 0.75) continue;
    addPlot('ringroad', Math.cos(a) * 100, Math.sin(a) * 100, -a + Math.PI / 2, true);
  }

  // --- Riverside: three rows facing the river (river runs along x = 112) ---
  const riverRows = [
    { x: 132, z0: -76, z1: 76 },
    { x: 148, z0: -72, z1: 72 },
    { x: 164, z0: -76, z1: 76 },
  ];
  for (const row of riverRows) {
    for (let z = row.z0; z <= row.z1 + 0.001; z += 8) {
      addPlot('riverside', row.x, z, Math.PI / 2);
    }
  }

  // --- Old Town: roomy grid of cottages (kept west of the ring road) ---
  for (const x of [-144, -132, -120, -108, -96]) {
    for (let z = -77; z <= 77.001; z += 11) {
      addPlot('oldtown', x, z, 0);
    }
  }

  // --- Assign residents (deterministic handles) ---
  const combos = [];
  for (const a of ADJECTIVES) for (const n of NOUNS) combos.push(a + n);
  rng.shuffle(combos);
  let ci = 0;
  for (const p of plots) {
    if (!p.open) p.resident = combos[ci++].toLowerCase();
  }

  // --- Downtown towers (grid, plaza/townhall/bank cut out) ---
  const grid = [-36, -24, -12, 12, 24, 36];
  const towerColors = ['#FFFFFF', '#DFF5E1', '#FFF3C4', '#DDEBF7', '#F6E3D3'];
  for (const gx of grid) {
    for (const gz of grid) {
      if (Math.abs(gx) < 16 && Math.abs(gz) < 18) continue;       // plaza
      if (Math.abs(gx) <= 14 && gz <= -24) continue;               // town hall
      if (Math.abs(gx) <= 14 && gz >= 36) continue;                // bank
      towers.push({
        x: gx, z: gz,
        w: rng.range(8, 11), d: rng.range(8, 11),
        h: rng.range(12, 28),
        color: rng.pick(towerColors),
        roofH: rng.range(1.5, 3),
      });
    }
  }

  // --- Trees: rejection sampled, kept clear of everything ---
  const trees = [];
  const avoid = [
    ...plots.map(p => ({ x: p.x, z: p.z, r: 9 })),
    ...towers.map(t => ({ x: t.x, z: t.z, r: 10 })),
    { x: 0, z: -34, r: 18 }, { x: 0, z: 42, r: 14 }, { x: 0, z: 0, r: 8 },
    { x: 105, z: -95, r: 26 }, { x: -115, z: 100, r: 20 },
  ];
  function clearOf(x, z) {
    if (Math.hypot(x, z) > 178) return false;
    if (Math.abs(x) < 48 && Math.abs(z) < 48) return false;      // downtown
    if (Math.abs(Math.hypot(x, z) - 60) < 9) return false;      // ring road
    if (Math.abs(x - 112) < 13 && Math.abs(z) < 150) return false; // river
    if (x > -150 && x < -80 && z > 110 && z < 126) return false; // runway
    for (const a of avoid) {
      const dx = x - a.x, dz = z - a.z;
      if (dx * dx + dz * dz < a.r * a.r) return false;
    }
    return true;
  }
  let guard = 0;
  while (trees.length < 130 && guard++ < 6000) {
    const x = rng.range(-176, 176), z = rng.range(-176, 176);
    if (!clearOf(x, z)) continue;
    trees.push({ x: round2(x), z: round2(z), s: round2(rng.range(0.8, 1.4)), shade: rng.int(0, 1) });
  }

  const houseCount = plots.filter(p => !p.open).length;
  const openCount = plots.filter(p => p.open).length;

  return {
    seed,
    districts,
    landmarks: LANDMARKS.map(l => ({ ...l })),
    plots,
    towers,
    trees,
    stats: { houses: houseCount, openPlots: openCount, residents: houseCount },
  };
}

export function minPlotDistance(plots) {
  let min = Infinity, pair = null;
  for (let i = 0; i < plots.length; i++) {
    for (let j = i + 1; j < plots.length; j++) {
      const dx = plots[i].x - plots[j].x, dz = plots[i].z - plots[j].z;
      const d = Math.hypot(dx, dz);
      if (d < min) { min = d; pair = [plots[i].id, plots[j].id]; }
    }
  }
  return { min: round2(min), pair };
}

function round2(n) { return Math.round(n * 100) / 100; }
