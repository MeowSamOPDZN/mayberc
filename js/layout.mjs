// Pure deterministic city layout for Maybe Real City.
// No DOM, no three.js — safe to import from Node for tests.
import { RNG } from './rng.mjs';
import { isValidHandle, normalizeHandle } from './routes.mjs';

export const SEED = 20261018;
export const LAUNCH_DATE_UTC = Date.UTC(2026, 9, 1); // Oct 1 2026

export const DISTRICTS = [
  { id: 'downtown',  name: 'Downtown',  street: "Founder's Row", color: '#e8b04b', anchor: { x: 0, z: 0 } },
  { id: 'northgate', name: 'Northgate', street: 'Gatehouse Lane', color: '#e8b04b', anchor: { x: 0, z: -96 } },
  { id: 'riverside', name: 'Riverside', street: 'Riverbend Row',  color: '#7ec8e3', anchor: { x: 94, z: 0 } },
  { id: 'oldtown',   name: 'Old Town',  street: 'Cobble Court',   color: '#9b7ede', anchor: { x: -94, z: 0 } },
  { id: 'hillview',  name: 'Hillview',  street: 'Summit Street',  color: '#bfe3b4', anchor: { x: 0, z: 96 } },
];

export const FOUNDER_HANDLE = 'hard8k.edt';
export const MANSION_PLOT_ID = 'mansion';

// Town center. Grand Plaza radius 18; Town Hall / Bank / Fountain are landmarks below.
export const PLAZA_RADIUS = 18;
export const MANSION = { x: 34, z: -18 };

// Ring road: rounded rectangle around downtown (half extents + corner radius).
export const RING = { hx: 54, hz: 54, r: 22, width: 8 };

// Perimeter of the rounded rectangle (straight sections + 4 quarter arcs).
function ringLength() {
  const straight = 4 * (RING.hx - RING.r) + 4 * (RING.hz - RING.r);
  return straight + 2 * Math.PI * RING.r;
}

// Point + tangent on the ring centerline for t in [0,1).
export function ringPoint(t) {
  const L = ringLength();
  let d = ((t % 1) + 1) % 1 * L;
  const sx = RING.hx - RING.r, sz = RING.hz - RING.r; // straight half-lengths
  // Order: east straight (x=+hx, z from -sz to +sz), then corners/straights clockwise.
  const segs = [
    { kind: 'line', from: [RING.hx, -sz], to: [RING.hx, sz] },          // east
    { kind: 'arc', c: [sx, sz], a0: 0, sweep: Math.PI / 2 },            // SE corner
    { kind: 'line', from: [sx, RING.hz], to: [-sx, RING.hz] },          // south
    { kind: 'arc', c: [-sx, sz], a0: Math.PI / 2, sweep: Math.PI / 2 },  // SW corner
    { kind: 'line', from: [-RING.hx, sz], to: [-RING.hx, -sz] },        // west
    { kind: 'arc', c: [-sx, -sz], a0: Math.PI, sweep: Math.PI / 2 },    // NW corner
    { kind: 'line', from: [-sx, -RING.hz], to: [sx, -RING.hz] },        // north
    { kind: 'arc', c: [sx, -sz], a0: Math.PI * 1.5, sweep: Math.PI / 2 }, // NE corner
  ];
  for (const s of segs) {
    const len = s.kind === 'line'
      ? Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1])
      : RING.r * s.sweep;
    if (d <= len || s === segs[segs.length - 1]) {
      if (s.kind === 'line') {
        const k = Math.min(1, Math.max(0, d / len));
        const x = s.from[0] + (s.to[0] - s.from[0]) * k;
        const z = s.from[1] + (s.to[1] - s.from[1]) * k;
        const tl = Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]) || 1;
        return { x, z, tx: (s.to[0] - s.from[0]) / tl, tz: (s.to[1] - s.from[1]) / tl };
      }
      const a = s.a0 + s.sweep * Math.min(1, Math.max(0, d / len));
      const x = s.c[0] + Math.cos(a) * RING.r;
      const z = s.c[1] + Math.sin(a) * RING.r;
      return { x, z, tx: -Math.sin(a), tz: Math.cos(a) };
    }
    d -= len;
  }
  return { x: RING.hx, z: -sz, tx: 0, tz: 1 };
}

export const LANDMARKS = [
  { id: 'townhall', name: 'Town Hall',      x: 0,    z: -34,  label: 'Town Hall' },
  { id: 'bank',     name: 'Town Bank',      x: 0,    z: 42,   label: 'Town Bank' },
  { id: 'fountain', name: 'Wishing Fountain', x: 0,  z: 0,    label: 'Wishing Fountain' },
  { id: 'stadium',  name: 'Cloud Stadium',  x: 130,  z: -110, label: 'Cloud Stadium' },
  { id: 'skyport',  name: 'Skyport Tower',  x: -130, z: 110,  label: 'Skyport Tower' },
  { id: 'casino',    name: 'Casino',         x: -135, z: -105, label: 'Casino' },
  { id: 'airport',  name: 'Airport',        x: 118,  z: 118,  label: 'Airport' },
];

export const BODY_PALETTE = ['#FFF6E9', '#FFFFFF', '#FFE3C2', '#DFF5E1', '#DDEBF7', '#E8DFF5'];
export const ROOF_PALETTE = ['#C96F4A', '#E08E45', '#8A5A44', '#5B6B7A', '#7A9B6D'];

export function dayNumber(nowMs = Date.now()) {
  return Math.floor((nowMs - LAUNCH_DATE_UTC) / 86400000) + 1;
}

// Build the full layout. Returns { plots, trees, landmarks, districts, stats }.
// All house plots are VACANT (open=true): visitors join to claim one.
export function buildLayout(seed = SEED) {
  const rng = new RNG(seed);
  const districts = DISTRICTS.map(d => ({ ...d }));
  const plots = [];
  const districtOf = id => districts.find(d => d.id === id);

  function addPlot(districtId, x, z, rot) {
    const d = districtOf(districtId);
    const id = 'p' + plots.length;
    plots.push({
      id,
      district: districtId,
      x: round2(x), z: round2(z), rot: round2(rot),
      open: true,       // vacant: FOR RENT sign until a visitor claims it
      rentSign: true,
      mansion: false,
      number: rng.int(1, 999),
      street: d.street,
      value: rng.int(180, 520),
      body: rng.int(0, BODY_PALETTE.length - 1),
      roof: rng.int(0, ROOF_PALETTE.length - 1),
    });
    return id;
  }

  // --- Northgate: 5 rows x 6 = 30 plots ---
  for (const z of [-150, -136, -122, -108, -94]) {
    for (const x of [-62, -37, -12, 12, 37, 62]) {
      addPlot('northgate', x + rng.range(-1.5, 1.5), z + rng.range(-1.5, 1.5), 0);
    }
  }
  // --- Hillview: mirror of northgate ---
  for (const z of [94, 108, 122, 136, 150]) {
    for (const x of [-62, -37, -12, 12, 37, 62]) {
      addPlot('hillview', x + rng.range(-1.5, 1.5), z + rng.range(-1.5, 1.5), 0);
    }
  }
  // --- Riverside: 3 rows x 10 = 30 plots ---
  for (const x of [80, 94, 108]) {
    for (let i = 0; i < 10; i++) {
      const z = -70 + i * (140 / 9) + rng.range(-1.5, 1.5);
      addPlot('riverside', x + rng.range(-1.5, 1.5), z, Math.PI / 2);
    }
  }
  // --- Old Town: mirror of riverside ---
  for (const x of [-80, -94, -108]) {
    for (let i = 0; i < 10; i++) {
      const z = -70 + i * (140 / 9) + rng.range(-1.5, 1.5);
      addPlot('oldtown', x + rng.range(-1.5, 1.5), z, Math.PI / 2);
    }
  }

  // --- Founder's mansion: fixed prime plot east of the plaza (always present) ---
  plots.push({
    id: MANSION_PLOT_ID,
    district: 'downtown',
    x: MANSION.x, z: MANSION.z, rot: 0,
    open: false,
    rentSign: false,
    mansion: true,
    number: 1,
    street: "Founder's Row",
    value: 5000,
    body: 1, roof: 0,
  });

  // --- Trees: only around the plaza edge (deterministic ring) ---
  const trees = [];
  let ti = 0, guard = 0;
  while (trees.length < 16 && guard++ < 400) {
    const a = (ti / 16) * Math.PI * 2 + rng.range(-0.12, 0.12);
    ti++;
    if (Math.abs(Math.cos(a)) < 0.3 || Math.abs(Math.sin(a)) < 0.3) continue; // keep roads clear
    const r = rng.range(23, 30);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (x > 16 && x < 50 && z > -32 && z < -4) continue;   // mansion grounds
    if (Math.abs(x) < 18 && z < -22 && z > -46) continue;  // town hall
    if (Math.abs(x) < 14 && z > 32 && z < 52) continue;    // bank
    trees.push({ x: round2(x), z: round2(z), s: round2(rng.range(0.9, 1.5)), shade: rng.int(0, 1) });
  }

  return {
    seed,
    districts,
    landmarks: LANDMARKS.map(l => ({ ...l })),
    plots,
    trees,
    stats: { openPlots: plots.filter(p => p.open).length },
  };
}

// Nearest free plot in a district to its anchor (used by the join flow).
export function nearestFreePlot(plots, districtId, takenPlotIds) {
  const d = DISTRICTS.find(x => x.id === districtId);
  if (!d) return null;
  const taken = new Set(takenPlotIds);
  let best = null, bestD = Infinity;
  for (const p of plots) {
    if (!p.open || p.mansion || p.district !== districtId || taken.has(p.id)) continue;
    const dd = Math.hypot(p.x - d.anchor.x, p.z - d.anchor.z);
    if (dd < bestD) { bestD = dd; best = p; }
  }
  return best;
}

// Pure claim planner (testable): validate the handle, pick the plot.
export function planClaim(plots, takenPlotIds, rawHandle, districtId, specificPlotId = null) {
  const handle = normalizeHandle(rawHandle);
  if (!isValidHandle(handle)) return { ok: false, reason: 'invalid' };
  if (handle === FOUNDER_HANDLE) return { ok: false, reason: 'taken' };
  const taken = new Set(takenPlotIds);
  if (specificPlotId) {
    const p = plots.find(x => x.id === specificPlotId);
    if (!p || !p.open || p.mansion || taken.has(p.id)) return { ok: false, reason: 'unavailable' };
    return { ok: true, handle, plotId: p.id };
  }
  const plot = nearestFreePlot(plots, districtId, takenPlotIds);
  if (!plot) return { ok: false, reason: 'full' };
  return { ok: true, handle, plotId: plot.id };
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

// Min distance from each plot to the ring road centerline (sampled).
export function minRingClearance(plots, samples = 360) {
  const pts = [];
  for (let i = 0; i < samples; i++) pts.push(ringPoint(i / samples));
  let min = Infinity, plotId = null;
  for (const p of plots) {
    for (const q of pts) {
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d < min) { min = d; plotId = p.id; }
    }
  }
  return { min: round2(min), plotId };
}

function round2(n) { return Math.round(n * 100) / 100; }
