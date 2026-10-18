// Maybe Real City test suite. Run: node test/run.mjs
// Covers: deterministic layout, plot/road/landmark geometry, mansion, handles,
// routing, claim planning, store (identity + claims index).
import {
  buildLayout, minPlotDistance, minRingClearance, nearestFreePlot, planClaim,
  dayNumber, SEED, DISTRICTS, LANDMARKS, MANSION_PLOT_ID, FOUNDER_HANDLE,
  MANSION, BODY_PALETTE, ROOF_PALETTE, ringPoint,
} from '../js/layout.mjs';
import { parseHash, findUrl, isValidHandle, normalizeHandle } from '../js/routes.mjs';
import { store, todayStamp } from '../js/store.mjs';

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

console.log('— layout determinism —');
{
  const a = buildLayout(SEED), b = buildLayout(SEED);
  ok('same seed -> identical JSON', JSON.stringify(a) === JSON.stringify(b));
  const c = buildLayout(SEED + 1);
  ok('different seed -> different layout', JSON.stringify(a) !== JSON.stringify(c));
  ok('exactly 120 vacant plots', a.plots.filter(p => p.open).length === 120, `got ${a.plots.filter(p => p.open).length}`);
  ok('all plots vacant w/ rent signs', a.plots.filter(p => p.open).every(p => p.rentSign === true));
  ok('30 plots per neighborhood', ['northgate', 'riverside', 'oldtown', 'hillview']
    .every(d => a.plots.filter(p => p.district === d && p.open).length === 30));
  ok('no pre-seeded residents', a.plots.every(p => p.resident === undefined));
  ok('5 districts', a.districts.length === 5);
  ok('7 landmarks', a.landmarks.length === 7, `got ${a.landmarks.length}`);
  ok('16 plaza trees', a.trees.length === 16, `got ${a.trees.length}`);
  ok('plot ids unique', new Set(a.plots.map(p => p.id)).size === a.plots.length);
  ok('palette indices in range', a.plots.every(p => p.body >= 0 && p.body < BODY_PALETTE.length && p.roof >= 0 && p.roof < ROOF_PALETTE.length));
}

console.log('— mansion —');
{
  const { plots } = buildLayout(SEED);
  const m = plots.find(p => p.id === MANSION_PLOT_ID);
  ok('mansion plot exists', !!m);
  ok('mansion on fixed prime plot', m && m.x === MANSION.x && m.z === MANSION.z, `got ${m && m.x},${m && m.z}`);
  ok('mansion flagged + not open', m && m.mansion === true && m.open === false && m.rentSign === false);
  ok('mansion downtown', m && m.district === 'downtown');
  ok('founder handle constant', FOUNDER_HANDLE === 'hard8k.edt' && isValidHandle(FOUNDER_HANDLE));
}

console.log('— geometry / overlaps —');
{
  const { plots, trees } = buildLayout(SEED);
  const { min, pair } = minPlotDistance(plots);
  ok('no plot overlaps (min >= 6)', min >= 6, `min=${min} pair=${pair}`);
  const rc = minRingClearance(plots);
  ok('plots clear of ring road (min >= 9)', rc.min >= 9, `min=${rc.min} plot=${rc.plotId}`);
  ok('residential plots clear of plaza', plots.filter(p => !p.mansion).every(p => Math.hypot(p.x, p.z) >= 30));
  let lmClear = true, lmBad = '';
  for (const p of plots) {
    for (const l of LANDMARKS) {
      if (Math.hypot(p.x - l.x, p.z - l.z) < 14) { lmClear = false; lmBad = `${p.id} vs ${l.id}`; }
    }
  }
  ok('plots clear of landmarks (>= 14)', lmClear, lmBad);
  ok('trees ring the plaza', trees.every(t => { const r = Math.hypot(t.x, t.z); return r >= 22 && r <= 31; }));
  ok('trees avoid mansion grounds', trees.every(t => !(t.x > 16 && t.x < 50 && t.z > -32 && t.z < -4)));
  ok('trees keep roads clear', trees.every(t => Math.abs(t.x) >= 5 && Math.abs(t.z) >= 5));
  const q0 = ringPoint(0);
  ok('ringPoint(0) on east straight', Math.abs(q0.x - 54) < 0.01 && Math.abs(q0.z + 32) < 0.01, `got ${q0.x},${q0.z}`);
  let cont = true;
  for (let i = 0; i < 360; i++) {
    const a = ringPoint(i / 360), b = ringPoint((i + 1) / 360);
    if (Math.hypot(a.x - b.x, a.z - b.z) > 4) cont = false;
  }
  ok('ring path is continuous', cont);
}

console.log('— handle validation (dots allowed) —');
{
  ok('accepts normal', isValidHandle('sunny_fox9'));
  ok('accepts dots', isValidHandle('hard8k.edt'));
  ok('accepts 2 chars', isValidHandle('ab'));
  ok('rejects 1 char', !isValidHandle('a'));
  ok('rejects 21 chars', !isValidHandle('x'.repeat(21)));
  ok('rejects spaces', !isValidHandle('a b'));
  ok('rejects bang', !isValidHandle('a!b'));
  ok('rejects empty', !isValidHandle(''));
  ok('normalize trims+lowercases', normalizeHandle('  Sunny.Fox ') === 'sunny.fox');
}

console.log('— hash routing —');
{
  ok('empty -> home', parseHash('').route === 'home');
  ok('#/townhall', parseHash('#/townhall').route === 'townhall');
  ok('#/about', parseHash('#/about').route === 'about');
  ok('#/privacy', parseHash('#/privacy').route === 'privacy');
  const f = parseHash('#/find/hard8k.edt');
  ok('find parses dotted handle', f.route === 'find' && f.handle === 'hard8k.edt');
  ok('find rejects bad chars', parseHash('#/find/a!b').route === 'home');
  ok('find rejects too-short', parseHash('#/find/a').route === 'home');
  ok('unknown -> home', parseHash('#/nope').route === 'home');
  ok('findUrl round-trips dotted', parseHash(findUrl('Hard8k.EDT')).handle === 'hard8k.edt');
}

console.log('— claim planning —');
{
  const { plots } = buildLayout(SEED);
  const r1 = planClaim(plots, [], 'newbie', 'northgate');
  ok('valid claim plans a plot', r1.ok && !!r1.plotId && r1.handle === 'newbie');
  // nearest free plot to the district anchor
  const d = DISTRICTS.find(x => x.id === 'northgate');
  const expect = nearestFreePlot(plots, 'northgate', []);
  ok('picks nearest free plot to anchor', r1.plotId === expect.id, `got ${r1.plotId} want ${expect.id}`);
  ok('chosen plot in chosen district', plots.find(p => p.id === r1.plotId).district === 'northgate');
  const r2 = planClaim(plots, [r1.plotId], 'second', 'northgate');
  ok('taken plot is skipped', r2.ok && r2.plotId !== r1.plotId);
  ok('invalid handle rejected', !planClaim(plots, [], 'x', 'northgate').ok);
  ok('founder handle rejected', planClaim(plots, [], 'hard8k.edt', 'northgate').reason === 'taken');
  ok('founder case-insensitive', planClaim(plots, [], 'Hard8k.EDT', 'northgate').reason === 'taken');
  const allTaken = plots.filter(p => p.open && p.district === 'hillview').map(p => p.id);
  ok('full district rejected', planClaim(plots, allTaken, 'late', 'hillview').reason === 'full');
  const specific = plots.find(p => p.open && p.district === 'riverside');
  const r3 = planClaim(plots, [], 'picker', 'riverside', specific.id);
  ok('specific plot claim works', r3.ok && r3.plotId === specific.id);
  ok('specific taken plot rejected', planClaim(plots, [specific.id], 'picker2', 'riverside', specific.id).reason === 'unavailable');
  ok('mansion plot not claimable', !planClaim(plots, [], 'sneaky', 'downtown', MANSION_PLOT_ID).ok);
  ok('bad district rejected', !planClaim(plots, [], 'x2', 'nowhere').ok);
}

console.log('— store (node in-memory fallback) —');
{
  store.clearAll();
  ok('default coins 100', store.coins === 100);
  ok('no identity by default', store.identity === null);
  store.identity = { handle: 'tester', plotId: 'p5', joinedAt: Date.now() };
  ok('identity round-trip', store.identity.handle === 'tester' && store.identity.plotId === 'p5');
  store.claims = [
    { plotId: 'p5', handle: 'tester', created: Date.now(), flag: false, tier: 0, body: 1, roof: 2 },
    { plotId: 'p9', handle: 'Pal.Two', created: Date.now(), flag: true, tier: 1, body: 0, roof: 0 },
  ];
  ok('claims round-trip', store.claims.length === 2);
  ok('claims index persisted', store.claimIndex.tester === 'p5' && store.claimIndex['pal.two'] === 'p9', JSON.stringify(store.claimIndex));
  store.claims = store.claims.filter(c => c.plotId !== 'p5');
  ok('index updates on rewrite', store.claimIndex.tester === undefined && store.claimIndex['pal.two'] === 'p9');
  store.settings = { gfx: 'low', cine: false };
  ok('settings round-trip', store.settings.gfx === 'low' && store.settings.cine === false);
  store.clearAll();
  ok('clearAll resets', store.claims.length === 0 && store.identity === null && Object.keys(store.claimIndex).length === 0 && store.coins === 100);
  ok('todayStamp format', /^\d{4}-\d{2}-\d{2}$/.test(todayStamp()));
}

console.log('— misc —');
{
  ok('dayNumber positive int', Number.isInteger(dayNumber()) && dayNumber() > 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
