// HUD, dialogs, quests, routing, house panel. Browser only.
import { parseHash, findUrl, isValidHandle, normalizeHandle, ROUTES } from './routes.mjs';
import { store, todayStamp } from './store.mjs';
import { dayNumber, newTodayCount, BODY_PALETTE, ROOF_PALETTE } from './layout.mjs';
import { UPGRADE_DEFS, FLAG_BONUS } from './build.mjs';

const $ = id => document.getElementById(id);

const QUESTS = [
  { id: 'sunrise',  name: 'Sunrise rounds',  desc: 'Fly to the Town Hall plaza and say good morning.', reward: 25 },
  { id: 'neighbor', name: 'Hello, neighbor', desc: 'Peek inside 3 different homes.', reward: 15 },
  { id: 'corners',  name: 'Four corners',    desc: 'Set foot in all four districts.', reward: 30 },
  { id: 'flagday',  name: 'Raise the flag',  desc: 'Plant your flag on a home you claimed.', reward: 20 },
  { id: 'wish',     name: 'Make a wish',     desc: 'Click the Wishing Fountain.', reward: 10 },
];

function questState() {
  const today = todayStamp();
  let q = store.quests;
  if (!q || q.date !== today) {
    q = { date: today, done: {}, progress: { neighbor: [], corners: [] } };
    store.quests = q;
  }
  return q;
}

export function initUI(ctx) {
  const { town, cam, layout } = ctx;
  const plotById = town.plotById;
  const districtName = id => layout.districts.find(d => d.id === id).name;

  let toastTimer = 0;
  function toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ---------- dialogs ----------
  const dialogs = ['dlg-townhall', 'dlg-house', 'dlg-quests', 'dlg-find', 'dlg-collection', 'dlg-about', 'dlg-privacy'];
  function openDialog(id) {
    for (const d of dialogs) $(d).hidden = d !== id;
    $('scrim').hidden = false;
  }
  function closeDialogs() {
    for (const d of dialogs) $(d).hidden = true;
    $('scrim').hidden = true;
    if (location.hash && location.hash !== '#/' && parseHash(location.hash).route !== ROUTES.HOME) {
      history.replaceState(null, '', '#/');
    }
  }
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeDialogs));
  $('scrim').addEventListener('click', closeDialogs);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDialogs(); });
  document.querySelectorAll('[data-open]').forEach(b =>
    b.addEventListener('click', () => openDialog('dlg-' + b.dataset.open)));

  // ---------- stats ----------
  function refreshStats() {
    const homes = layout.stats.houses + store.claims.length;
    $('stat-houses').textContent = homes;
    $('stat-residents').textContent = homes;
    $('stat-day').textContent = dayNumber();
    $('stat-new').textContent = newTodayCount();
    $('coin-count').textContent = store.coins.toLocaleString();
    const qc = $('quest-coins');
    if (qc) qc.textContent = store.coins.toLocaleString();
  }

  // ---------- camera flights ----------
  function flyToPlot(plot, radius = 44) {
    cam.flyTo(plot.x, plot.z, radius);
    if (plot.district && plot.district !== 'downtown') questProgress('corners', plot.district);
  }
  function flyToDistrict(id) {
    const d = layout.districts.find(x => x.id === id);
    if (!d) return;
    cam.flyTo(d.anchor.x, d.anchor.z, 130);
    questProgress('corners', id);
  }
  function flyToLandmark(id) {
    const l = layout.landmarks.find(x => x.id === id);
    if (!l) return;
    cam.flyTo(l.x, l.z, id === 'fountain' ? 46 : 62);
    if (id === 'townhall') questProgress('sunrise');
  }

  // ---------- quest engine ----------
  function questProgress(kind, value) {
    const q = questState();
    let changed = false;
    if (kind === 'sunrise' && !q.progress.sunrise) { q.progress.sunrise = true; changed = true; }
    if (kind === 'neighbor' && !q.progress.neighbor.includes(value)) {
      q.progress.neighbor.push(value); changed = true;
    }
    if (kind === 'corners' && !q.progress.corners.includes(value)) {
      q.progress.corners.push(value); changed = true;
    }
    if (kind === 'flagday' && !q.progress.flagday) { q.progress.flagday = true; changed = true; }
    if (kind === 'wish' && !q.progress.wish) { q.progress.wish = true; changed = true; }
    if (changed) { store.quests = q; renderQuests(); }
  }

  function questComplete(id) {
    const q = questState().progress;
    switch (id) {
      case 'sunrise': return !!q.sunrise;
      case 'neighbor': return q.neighbor.length >= 3;
      case 'corners': return q.corners.length >= 4;
      case 'flagday': return !!q.flagday;
      case 'wish': return !!q.wish;
    }
    return false;
  }

  function questProgressText(id) {
    const q = questState().progress;
    if (id === 'neighbor') return `${Math.min(q.neighbor.length, 3)}/3 homes peeked`;
    if (id === 'corners') return `${q.corners.length}/4 districts visited`;
    return questComplete(id) ? 'Done — claim your coins' : 'Not yet';
  }

  function renderQuests() {
    const q = questState();
    const ul = $('quest-list');
    ul.innerHTML = '';
    for (const def of QUESTS) {
      const claimed = !!q.done[def.id];
      const complete = questComplete(def.id);
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="quest-top"><span class="quest-name">${def.name}</span>
        <span class="quest-reward">◉ ${def.reward}</span></div>
        <p class="quest-desc">${def.desc} — ${questProgressText(def.id)}</p>`;
      const btn = document.createElement('button');
      btn.className = 'quest-btn' + (claimed ? ' claimed' : '');
      btn.textContent = claimed ? '✓ Claimed' : (complete ? 'Claim coins' : 'In progress…');
      btn.disabled = claimed || !complete;
      btn.addEventListener('click', () => {
        const st = questState();
        if (st.done[def.id] || !questComplete(def.id)) return;
        st.done[def.id] = true;
        store.quests = st;
        store.coins = store.coins + def.reward;
        refreshStats(); renderQuests();
        toast(`+${def.reward} Town Coins — nice work!`);
      });
      li.appendChild(btn);
      ul.appendChild(li);
    }
  }

  // ---------- house panel ----------
  let currentPlot = null;
  function claimFor(plotId) {
    return store.claims.find(c => c.plotId === plotId) || null;
  }
  function myClaims() { return store.claims; }

  function openHouse(plot) {
    currentPlot = plot;
    const claim = claimFor(plot.id);
    const resident = claim ? '@' + claim.handle : '@' + plot.resident;
    $('house-name').textContent = resident + "'s home";
    $('house-district').textContent = districtName(plot.district);
    $('house-address').textContent = `${plot.number} ${plot.street}`;
    const { total, lines } = town.claimValue(plot, claim);
    $('house-value').textContent = total.toLocaleString();
    const bd = $('value-breakdown');
    bd.innerHTML = lines.map(([k, v]) => `<li><span>${k}</span><span>◉ ${v}</span></li>`).join('');
    bd.hidden = true;
    $('value-toggle').setAttribute('aria-expanded', 'false');
    $('value-toggle').textContent = 'breakdown ▾';

    const owned = !!claim;
    $('house-owner-note').hidden = !owned;
    $('ha-remove').hidden = !owned;
    for (const id of ['ha-flag', 'ha-upgrade', 'ha-look']) $(id).disabled = false;
    $('house-hint').textContent = owned
      ? 'This home is yours — fly the flag, upgrade it, give it a fresh coat of paint.'
      : 'Someone lives here. Only the owner can redecorate, but you can still say hi.';
    questProgress('neighbor', plot.id);
    openDialog('dlg-house');
  }

  $('value-toggle').addEventListener('click', () => {
    const bd = $('value-breakdown');
    bd.hidden = !bd.hidden;
    $('value-toggle').setAttribute('aria-expanded', String(!bd.hidden));
    $('value-toggle').textContent = bd.hidden ? 'breakdown ▾' : 'breakdown ▴';
  });

  $('ha-share').addEventListener('click', async () => {
    if (!currentPlot) return;
    const claim = claimFor(currentPlot.id);
    const handle = claim ? claim.handle : currentPlot.resident;
    const url = location.origin + location.pathname + findUrl(handle);
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied — send a friend to this doorstep.');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Link copied — send a friend to this doorstep.'); }
      catch { toast(url); }
      ta.remove();
    }
  });

  $('ha-flag').addEventListener('click', () => {
    const claim = currentPlot && claimFor(currentPlot.id);
    if (!claim) { $('house-hint').textContent = 'Only the owner can fly a flag here — claim your own plot to fly yours.'; return; }
    if (claim.flag) { $('house-hint').textContent = 'Your flag is already flying proud.'; return; }
    claim.flag = true;
    store.claims = store.claims;
    town.refreshClaims();
    questProgress('flagday');
    $('house-hint').textContent = 'Flag planted! It flutters over your roof now.';
    toast('⚑ Flag flying over your home.');
  });

  $('ha-upgrade').addEventListener('click', () => {
    const claim = currentPlot && claimFor(currentPlot.id);
    if (!claim) { $('house-hint').textContent = 'Only the owner can upgrade this home.'; return; }
    const next = UPGRADE_DEFS.find(u => u.tier === claim.tier + 1);
    if (!next) { $('house-hint').textContent = 'Fully upgraded — this home is a town landmark in its own right.'; return; }
    if (store.coins < next.cost) {
      $('house-hint').textContent = `The ${next.name.toLowerCase()} costs ◉ ${next.cost} — you're short. Try the Treasury quests!`;
      return;
    }
    store.coins = store.coins - next.cost;
    claim.tier += 1;
    store.claims = store.claims;
    town.refreshClaims();
    refreshStats();
    openHouse(currentPlot);
    toast(`${next.name} added to your home!`);
  });

  $('ha-look').addEventListener('click', () => {
    const claim = currentPlot && claimFor(currentPlot.id);
    if (!claim) { $('house-hint').textContent = 'Only the owner can repaint this home.'; return; }
    claim.body = (claim.body + 1) % BODY_PALETTE.length;
    claim.roof = (claim.roof + 2) % ROOF_PALETTE.length;
    store.claims = store.claims;
    town.refreshClaims();
    $('house-hint').textContent = 'Fresh coat of paint — looking brand new.';
  });

  $('ha-remove').addEventListener('click', () => {
    const claim = currentPlot && claimFor(currentPlot.id);
    if (!claim) return;
    if (!confirm(`Remove your name from ${currentPlot.number} ${currentPlot.street}? The plot goes back on the market.`)) return;
    store.claims = store.claims.filter(c => c.plotId !== currentPlot.id);
    town.refreshClaims();
    refreshStats();
    closeDialogs();
    toast('Your name is off the door. The plot is open again.');
  });

  // ---------- claim flow ----------
  let claimPlot = null;
  function openClaimForPlot(plot) {
    claimPlot = plot;
    pendingHandle = null;
    $('find-text').innerHTML = `This is an open plot at <strong>${plot.number} ${plot.street}</strong> (${districtName(plot.district)}). Give it a name and the town will raise a home there.`;
    const inp = $('find-handle-input');
    inp.style.display = '';
    inp.value = '';
    openDialog('dlg-find');
    setTimeout(() => inp.focus(), 150);
  }

  function doClaim(plot, rawHandle) {
    const handle = normalizeHandle(rawHandle);
    if (!isValidHandle(handle)) { toast('Handles are 2–20 letters, numbers, or underscores.'); return; }
    const taken = store.claims.some(c => c.handle === handle) ||
      town.housePlots.some(p => p.resident === handle);
    if (taken) { toast(`@${handle} is already taken — try another.`); return; }
    const claim = {
      plotId: plot.id, handle, created: Date.now(),
      flag: false, tier: 0, body: plot.body, roof: plot.roof,
    };
    const claims = store.claims;
    claims.push(claim);
    store.claims = claims;
    town.refreshClaims();
    refreshStats();
    closeDialogs();
    town.burst(plot.x, plot.z);
    flyToPlot(plot, 40);
    setTimeout(() => openHouse(plot), 900);
    toast(`Welcome home, @${handle}!`);
  }

  $('find-claim').addEventListener('click', () => {
    if (claimPlot) {
      doClaim(claimPlot, $('find-handle-input').value);
    } else if (pendingHandle) {
      const open = town.layout.plots.find(p => p.open && !store.claims.some(c => c.plotId === p.id));
      if (!open) { toast('No open plots left — the town is full!'); return; }
      doClaim(open, pendingHandle);
    }
  });

  // ---------- find ----------
  let pendingHandle = null;
  function findHouse(rawHandle) {
    const handle = normalizeHandle(rawHandle);
    if (!isValidHandle(handle)) { toast('Handles are 2–20 letters, numbers, or underscores.'); return; }
    const claim = store.claims.find(c => c.handle === handle);
    if (claim) {
      const plot = plotById.get(claim.plotId);
      if (plot) { closeDialogs(); flyToPlot(plot, 40); setTimeout(() => openHouse(plot), 800); return; }
    }
    const seeded = town.housePlots.find(p => p.resident === handle);
    if (seeded) {
      closeDialogs(); flyToPlot(seeded, 44); setTimeout(() => openHouse(seeded), 800); return;
    }
    pendingHandle = handle;
    claimPlot = null;
    $('find-text').innerHTML = `There's no house for <strong>@${handle}</strong> yet. Claim an open plot and the town will raise a brand-new home with your name on the door.`;
    $('find-handle-input').style.display = 'none';
    openDialog('dlg-find');
  }

  $('search-pill').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('search-input').value;
    if (!v.trim()) return;
    if (location.hash === findUrl(normalizeHandle(v))) findHouse(v);
    else location.hash = findUrl(normalizeHandle(v));
    $('search-input').blur();
  });

  // ---------- town hall hub ----------
  $('gear-btn').addEventListener('click', () => { renderFeed(); openDialog('dlg-townhall'); });
  $('coin-pill').addEventListener('click', () => { renderQuests(); openDialog('dlg-quests'); });
  $('th-treasury').addEventListener('click', () => { renderQuests(); openDialog('dlg-quests'); });
  $('th-upgrade').addEventListener('click', () => {
    const mine = myClaims()[0];
    if (!mine) { toast('Claim a home first — then upgrade it here.'); return; }
    openHouse(plotById.get(mine.plotId));
  });
  $('th-look').addEventListener('click', () => {
    const mine = myClaims()[0];
    if (!mine) { toast('Claim a home first — then give it a fresh look.'); return; }
    mine.body = (mine.body + 1) % BODY_PALETTE.length;
    mine.roof = (mine.roof + 2) % ROOF_PALETTE.length;
    store.claims = store.claims;
    town.refreshClaims();
    toast('Fresh look applied to your home!');
  });
  $('th-collection').addEventListener('click', () => { renderCollection(); openDialog('dlg-collection'); });

  {
    const lm = $('th-landmarks');
    for (const l of layout.landmarks) {
      const b = document.createElement('button');
      b.className = 'desk-btn';
      b.textContent = '⌖ ' + l.name;
      b.addEventListener('click', () => { closeDialogs(); flyToLandmark(l.id); });
      lm.appendChild(b);
    }
  }

  function renderFeed() {
    const ul = $('th-feed');
    ul.innerHTML = '';
    const claims = store.claims.slice().sort((a, b) => b.created - a.created).slice(0, 6);
    if (!claims.length) {
      ul.innerHTML = '<li class="empty">No claimed homes yet — be the first on the block!</li>';
      return;
    }
    for (const c of claims) {
      const p = plotById.get(c.plotId);
      const li = document.createElement('li');
      li.innerHTML = `<span>@${c.handle} · ${p ? districtName(p.district) : ''}</span>`;
      const b = document.createElement('button');
      b.textContent = 'Fly there';
      b.addEventListener('click', () => { closeDialogs(); if (p) { flyToPlot(p, 44); setTimeout(() => openHouse(p), 800); } });
      li.appendChild(b);
      ul.appendChild(li);
    }
  }

  function renderCollection() {
    const ul = $('collection-list');
    ul.innerHTML = '';
    const claims = store.claims.slice().sort((a, b) => b.created - a.created);
    if (!claims.length) {
      ul.innerHTML = '<li class="empty">Nothing claimed yet. The town is waiting.</li>';
      return;
    }
    for (const c of claims) {
      const p = plotById.get(c.plotId);
      const li = document.createElement('li');
      li.innerHTML = `<span>@${c.handle} · ${p ? `${p.number} ${p.street}` : ''}</span>`;
      const b = document.createElement('button');
      b.textContent = 'Visit';
      b.addEventListener('click', () => { closeDialogs(); if (p) { flyToPlot(p, 44); setTimeout(() => openHouse(p), 800); } });
      li.appendChild(b);
      ul.appendChild(li);
    }
  }

  // ---------- graphics settings ----------
  function applyGfx() {
    const s = store.settings;
    const mode = s.gfx === 'auto'
      ? (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768 ? 'low' : 'high')
      : s.gfx;
    ctx.renderer.setPixelRatio(mode === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    town.setQuality(mode);
    cam.autoRotate = !!s.cine;
    document.querySelectorAll('#gfx-seg .seg-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.gfx === s.gfx));
    $('cine-toggle').checked = !!s.cine;
  }
  document.querySelectorAll('#gfx-seg .seg-btn').forEach(b =>
    b.addEventListener('click', () => {
      const s = store.settings; s.gfx = b.dataset.gfx; store.settings = s; applyGfx();
    }));
  $('cine-toggle').addEventListener('change', e => {
    const s = store.settings; s.cine = e.target.checked; store.settings = s; applyGfx();
  });

  // ---------- minimap ----------
  $('minimap').addEventListener('click', e => {
    const d = e.target.closest('[data-d]');
    if (d) { closeDialogs(); flyToDistrict(d.dataset.d); }
  });

  // ---------- routing ----------
  function route() {
    const r = parseHash(location.hash);
    if (r.route === ROUTES.FIND) findHouse(r.handle);
    else if (r.route === ROUTES.TOWNHALL) { renderFeed(); openDialog('dlg-townhall'); }
    else if (r.route === ROUTES.ABOUT) openDialog('dlg-about');
    else if (r.route === ROUTES.PRIVACY) openDialog('dlg-privacy');
    else closeDialogs();
  }
  window.addEventListener('hashchange', route);

  // initial paint
  refreshStats();
  applyGfx();
  renderQuests();

  return {
    toast, openHouse, openClaimForPlot, findHouse, flyToPlot, flyToDistrict, flyToLandmark,
    questProgress, refreshStats, route,
  };
}
