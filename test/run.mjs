// Maybe Real City test suite. Run: node test/run.mjs
// Covers: deterministic layout, plot overlaps, route parsing, handle rules, store.
import { buildLayout, minPlotDistance, dayNumber, newTodayCount, SEED, BODY_PALETTE, ROOF_PALETTE } from '../js/layout.mjs';
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
  ok('house count ~250', a.stats.houses >= 240 && a.stats.houses <= 270, `got ${a.stats.houses}`);
  ok('open plots exist', a.stats.openPlots >= 15, `got ${a.stats.openPlots}`);
  ok('towers exist', a.towers.length >= 20, `got ${a.towers.length}`);
  ok('trees planted', a.trees.length === 130, `got ${a.trees.length}`);
  ok('4 districts', a.districts.length === 4);
  ok('5 landmarks', a.landmarks.length === 5);
}

console.log('— plot geometry —');
{
  const { plots } = buildLayout(SEED);
  const { min, pair } = minPlotDistance(plots);
  ok('no plot overlaps (min >= 6)', min >= 6, `min=${min} pair=${pair}`);
  const houses = plots.filter(p => !p.open);
  const residents = houses.map(p => p.resident);
  ok('residents unique', new Set(residents).size === residents.length);
  ok('residents valid handles', residents.every(r => /^[a-z0-9_]{2,20}$/.test(r)));
  ok('palette indices in range', plots.every(p => p.body >= 0 && p.body < BODY_PALETTE.length && p.roof >= 0 && p.roof < ROOF_PALETTE.length));
  ok('values positive', plots.every(p => p.value > 0));
  ok('open plots have no resident', plots.filter(p => p.open).every(p => p.resident === null));
  // open plots not too close to houses either (covered by min distance above)
  ok('plot ids unique', new Set(plots.map(p => p.id)).size === plots.length);
}

console.log('— hash routing —');
{
  ok('empty -> home', parseHash('').route === 'home');
  ok('#/ -> home', parseHash('#/').route === 'home');
  ok('#/townhall', parseHash('#/townhall').route === 'townhall');
  ok('#/about', parseHash('#/about').route === 'about');
  ok('#/privacy', parseHash('#/privacy').route === 'privacy');
  const f = parseHash('#/find/SunnyFox');
  ok('find parses + lowercases', f.route === 'find' && f.handle === 'sunnyfox');
  ok('find rejects bad chars', parseHash('#/find/a!b').route === 'home');
  ok('find rejects too-short', parseHash('#/find/a').route === 'home');
  ok('find rejects too-long', parseHash('#/find/' + 'x'.repeat(21)).route === 'home');
  ok('unknown -> home', parseHash('#/nope').route === 'home');
  ok('findUrl round-trips', parseHash(findUrl('AmberFox')).handle === 'amberfox');
}

console.log('— handle validation —');
{
  ok('accepts normal', isValidHandle('sunny_fox9'));
  ok('accepts 2 chars', isValidHandle('ab'));
  ok('rejects 1 char', !isValidHandle('a'));
  ok('rejects 21 chars', !isValidHandle('x'.repeat(21)));
  ok('rejects spaces', !isValidHandle('a b'));
  ok('rejects empty', !isValidHandle(''));
  ok('normalize trims+lowercases', normalizeHandle('  SunnyFox ') === 'sunnyfox');
}

console.log('— store (node in-memory fallback) —');
{
  store.clearAll();
  ok('default coins 100', store.coins === 100);
  store.coins = 250; ok('coins round-trip', store.coins === 250);
  store.claims = [{ plotId: 'p1', handle: 'tester' }];
  ok('claims round-trip', store.claims.length === 1 && store.claims[0].handle === 'tester');
  store.settings = { gfx: 'low', cine: false };
  ok('settings round-trip', store.settings.gfx === 'low' && store.settings.cine === false);
  store.clearAll();
  ok('clearAll resets', store.claims.length === 0 && store.coins === 100);
  ok('todayStamp format', /^\d{4}-\d{2}-\d{2}$/.test(todayStamp()));
}

console.log('— misc —');
{
  ok('dayNumber positive int', Number.isInteger(dayNumber()) && dayNumber() > 0);
  ok('newTodayCount deterministic', newTodayCount() === newTodayCount());
  ok('newTodayCount in range', newTodayCount() >= 3 && newTodayCount() <= 9);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
