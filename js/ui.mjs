// HUD, dialogs, quests, routing, house panel, join flow. Browser only.
import { parseHash, findUrl, isValidHandle, normalizeHandle, ROUTES } from './routes.mjs';
import { store, todayStamp } from './store.mjs';
import { dayNumber, planClaim, FOUNDER_HANDLE, BODY_PALETTE, ROOF_PALETTE } from './layout.mjs';
import { UPGRADE_DEFS, FLAG_BONUS } from './build.mjs';

const $ = id => document.getElementById(id);

const QUESTS = [
  { id: 'sunrise',  name: 'Sunrise rounds',  desc: 'Fly to the Town Hall plaza and say good morning.', reward: 25 },
  { id: 'neighbor', name: 'Hello, neighbor', desc: 'Peek inside 3 different homes.', reward: 15 },
  { id: 'corners',  name: 'Four neighborhoods', desc: 'Set foot in all four neighborhoods.', reward: 30 },
  { id: 'flagday',  name: 'Raise the flag',  desc: 'Plant your flag on a home you claimed.', reward: 20 },
  { id: 'wish',     name: 'Make a wish',     desc: 'Click the Wishing Fountain.', reward: 10 },
];
const NEIGHBORHOODS = ['northgate', 'riverside', 'oldtown', 'hillview'];

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
  const districtName = id => {
    const d = layout.districts.find(x => x.id === id);
    return d ? d.name : id;
  };

  let toastTimer = 0;
  function toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ---------- dialogs ----------
  const dialogs = ['dlg-townhall', 'dlg-house', 'dlg-quests', 'dlg-find', 'dlg-collection', 'dlg-about', 'dlg-privacy', 'dlg-welcome'];
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
    const claims = store.claims;
    const homes = 1 + claims.length; // the Founder's Mansion + claimed homes
    $('stat-houses').textContent = homes;
    $('stat-residents').textContent = homes;
    $('stat-day').textContent = dayNumber();
    const today = todayStamp();
    $('stat-new').textContent = claims.filter(c => todayStamp(new Date(c.created)) === today).length;
    $('coin-count').textContent = store.coins.toLocaleString();
    const qc = $('quest-coins');
    if (qc) qc.textContent = store.coins.toLocaleString();
  }

  // ---------- camera flights ----------
  function flyToPlot(plot, radius = 44) {
    cam.flyTo(plot.x, plot.z, radius);
    if (plot.district && NEIGHBORHOODS.includes(plot.district)) questProgress('corners', plot.district);
  }
  function flyToDistrict(id) {
    const d = layout.districts.find(x => x.id === id);
    if (!d) return;
    cam.flyTo(d.anchor.x, d.anchor.z, 130);
    if (NEIGHBORHOODS.includes(id)) questProgress('corners', id);
  }
  function flyToLandmark(id) {
    const l = layout.landmarks.find(x => x.id === id);
    if (!l) return;
    cam.flyTo(l.x, l.z, id === 'fountain' ? 46 : 70);
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
      case 'corners': return NEIGHBORHOODS.every(n => q.corners.includes(n));
      case 'flagday': return !!q.flagday;
      case 'wish': return !!q.wish;
    }
    return false;
  }

  function questProgressText(id) {
    const q = questState().progress;
    if (id === 'neighbor') return `${Math.min(q.neighbor.length, 3)}/3 homes peeked`;
    if (id === 'corners') return `${NEIGHBORHOODS.filter(n => q.corners.includes(n)).length}/4 neighborhoods visited`;
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

  // ---------- identity / claims ----------
  function myClaim() {
    const me = store.identity;
    if (!me) return null;
    return store.claims.find(c => c.plotId === me.plotId) || null;
  }

  // ---------- house panel ----------
  let currentPlot = null;
  function openHouse(plot) {
    const claim = store.claims.find(c => c.plotId === plot.id) || null;
    const isMansion = !!plot.mansion;
    if (!claim && !isMansion) return; // vacant plots open the claim flow, not this panel
    currentPlot = plot;
    const me = store.identity;
    const owned = !!claim && !!me && me.handle === claim.handle;
    const handle = isMansion ? FOUNDER_HANDLE : claim.handle;
    $('house-name').textContent = isMansion ? `@${FOUNDER_HANDLE}'s mansion` : `@${handle}'s home`;
    $('house-district').textContent = districtName(plot.district);
    $('house-address').textContent = `${plot.number} ${plot.street}`;
    const { total, lines } = town.claimValue(plot, claim);
    $('house-value').textContent = total.toLocaleString();
    const bd = $('value-breakdown');
    bd.innerHTML = lines.map(([k, v]) => `<li><span>${k}</span><span>◉ ${v}</span></li>`).join('');
    bd.hidden = true;
    $('value-toggle').setAttribute('aria-expanded', 'false');
    $('value-toggle').textContent = 'breakdown ▾';

    $('house-owner-note').hidden = !owned;
    $('ha-remove').hidden = !owned;
    for (const id of ['ha-flag', 'ha-upgrade', 'ha-look']) $(id).disabled = isMansion;
    $('house-hint').textContent = isMansion
      ? "The founder's mansion — look around, but the paint stays as it is."
      : owned
        ? 'This home is yours — fly the flag, upgrade it, give it a fresh coat of paint.'
        : 'A neighbor lives here. Wave hello, then claim your own plot to build yours.';
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
    const claim = store.claims.find(c => c.plotId === currentPlot.id);
    const handle = currentPlot.mansion ? FOUNDER_HANDLE : (claim ? claim.handle : null);
    if (!handle) return;
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
    const claim = myClaim();
    if (!claim || !currentPlot || claim.plotId !== currentPlot.id) {
      $('house-hint').textContent = 'Only the owner can fly a flag here — claim your own plot to fly yours.';
      return;
    }
    if (claim.flag) { $('house-hint').textContent = 'Your flag is already flying proud.'; return; }
    claim.flag = true;
    store.claims = store.claims;
    town.refreshClaims();
    questProgress('flagday');
    $('house-hint').textContent = 'Flag planted! It flutters over your roof now.';
    toast('⚑ Flag flying over your home.');
  });

  $('ha-upgrade').addEventListener('click', () => {
    const claim = myClaim();
    if (!claim || !currentPlot || claim.plotId !== currentPlot.id) {
      $('house-hint').textContent = 'Only the owner can upgrade this home.';
      return;
    }
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
    const claim = myClaim();
    if (!claim || !currentPlot || claim.plotId !== currentPlot.id) {
      $('house-hint').textContent = 'Only the owner can repaint this home.';
      return;
    }
    claim.body = (claim.body + 1) % BODY_PALETTE.length;
    claim.roof = (claim.roof + 2) % ROOF_PALETTE.length;
    store.claims = store.claims;
    town.refreshClaims();
    $('house-hint').textContent = 'Fresh coat of paint — looking brand new.';
  });

  $('ha-remove').addEventListener('click', () => {
    const claim = myClaim();
    if (!claim || !currentPlot || claim.plotId !== currentPlot.id) return;
    if (!confirm(`Give up your home at ${currentPlot.number} ${currentPlot.street}? The plot goes back on the market.`)) return;
    store.claims = store.claims.filter(c => c.plotId !== currentPlot.id);
    store.identity = null;
    town.refreshClaims();
    refreshStats();
    closeDialogs();
    toast('Your name is off the door. The plot is open again.');
  });

  // ---------- join flow ----------
  let joinPlot = null;      // preselected plot (from a FOR RENT sign) or null
  let joinDistrict = 'northgate';
  let welcomeShown = false;

  function renderDistrictPicker() {
    const wrap = $('welcome-districts');
    wrap.innerHTML = '';
    for (const id of NEIGHBORHOODS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'desk-btn dist-btn' + (id === joinDistrict ? ' active' : '');
      b.textContent = districtName(id);
      b.addEventListener('click', () => { joinDistrict = id; renderDistrictPicker(); });
      wrap.appendChild(b);
    }
  }

  function openWelcome({ plot = null, handle = '' } = {}) {
    joinPlot = plot;
    if (plot) joinDistrict = plot.district;
    renderDistrictPicker();
    $('welcome-districts').style.display = plot ? 'none' : '';
    $('welcome-district-label').style.display = plot ? 'none' : '';
    $('welcome-plot-note').textContent = plot
      ? `Plot ${plot.number} · ${plot.street} (${districtName(plot.district)}) — this one will be yours.`
      : 'Pick a neighborhood — the town will raise your home on a good open plot there.';
    $('welcome-handle').value = handle || '';
    $('welcome-error').textContent = '';
    openDialog('dlg-welcome');
    setTimeout(() => $('welcome-handle').focus(), 150);
  }

  const REASONS = {
    invalid: 'Handles are 2–20 letters, numbers, dots, or underscores.',
    taken: 'That name is already taken — try another.',
    full: 'That neighborhood is full — pick another one.',
    unavailable: 'That plot just got claimed — pick another.',
  };

  function doJoin() {
    if (store.identity) { toast(`You're already @${store.identity.handle} — one home per neighbor.`); return; }
    const raw = $('welcome-handle').value;
    const takenIds = store.claims.map(c => c.plotId);
    const plan = joinPlot
      ? planClaim(layout.plots, takenIds, raw, joinPlot.district, joinPlot.id)
      : planClaim(layout.plots, takenIds, raw, joinDistrict);
    if (!plan.ok || store.claimIndex[plan.handle]) {
      $('welcome-error').textContent = plan.ok ? REASONS.taken : (REASONS[plan.reason] || REASONS.unavailable);
      return;
    }
    const plot = plotById.get(plan.plotId);
    if (!plot) { $('welcome-error').textContent = REASONS.unavailable; return; }
    const claim = {
      plotId: plan.plotId, handle: plan.handle, created: Date.now(),
      flag: false, tier: 0,
      body: Math.floor(Math.random() * BODY_PALETTE.length),
      roof: Math.floor(Math.random() * ROOF_PALETTE.length),
    };
    store.claims = [...store.claims, claim];
    store.identity = { handle: plan.handle, plotId: plan.plotId, joinedAt: Date.now() };
    town.refreshClaims();
    refreshStats();
    closeDialogs();
    town.burst(plot.x, plot.z);
    flyToPlot(plot, 40);
    setTimeout(() => openHouse(plot), 900);
    toast(`Welcome home, @${plan.handle}!`);
  }

  $('welcome-build').addEventListener('click', doJoin);
  $('welcome-handle').addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });

  function maybeWelcome() {
    if (welcomeShown || store.identity) return;
    welcomeShown = true;
    openWelcome();
  }

  // ---------- vacant plot (FOR RENT sign) ----------
  function openClaimForPlot(plot) {
    const me = store.identity;
    if (me) { toast(`You're already @${me.handle} — one home per neighbor.`); return; }
    openWelcome({ plot });
  }

  // ---------- find ----------
  function addFindBtn(actions, text, primary, onClick) {
    const b = document.createElement('button');
    b.className = 'desk-btn' + (primary ? ' primary' : '');
    b.textContent = text;
    b.addEventListener('click', onClick);
    actions.appendChild(b);
  }

  function findHouse(rawHandle) {
    const handle = normalizeHandle(rawHandle);
    if (!isValidHandle(handle)) { toast('Handles are 2–20 letters, numbers, dots, or underscores.'); return; }
    const me = store.identity;
    // founder's mansion
    if (handle === FOUNDER_HANDLE) {
      closeDialogs();
      flyToPlot(town.mansionPlot, 44);
      setTimeout(() => openHouse(town.mansionPlot), 800);
      return;
    }
    // claimed home
    const plotId = store.claimIndex[handle];
    if (plotId) {
      const plot = plotById.get(plotId);
      if (plot) { closeDialogs(); flyToPlot(plot, 40); setTimeout(() => openHouse(plot), 800); return; }
    }
    // unknown handle
    const actions = $('find-actions');
    actions.innerHTML = '';
    if (me && me.handle === handle) {
      const p = plotById.get(me.plotId);
      closeDialogs();
      if (p) { flyToPlot(p, 40); setTimeout(() => openHouse(p), 800); }
      return;
    }
    $('find-title').textContent = 'No home yet';
    if (me) {
      $('find-text').innerHTML = `There's no house for <strong>@${handle}</strong> yet — and you're already <strong>@${me.handle}</strong>. One home per neighbor in this town.`;
      addFindBtn(actions, 'Visit my house', true, () => {
        const p = plotById.get(me.plotId);
        closeDialogs();
        if (p) { flyToPlot(p, 40); setTimeout(() => openHouse(p), 800); }
      });
    } else {
      $('find-text').innerHTML = `There's no house for <strong>@${handle}</strong> yet. Claim the name and the town will raise a brand-new home with it on the door.`;
      addFindBtn(actions, 'Claim this name', true, () => openWelcome({ handle }));
    }
    addFindBtn(actions, 'Keep exploring', false, closeDialogs);
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
    const mine = myClaim();
    if (!mine) { toast('Join the town first — then upgrade your home here.'); return; }
    openHouse(plotById.get(mine.plotId));
  });
  $('th-look').addEventListener('click', () => {
    const mine = myClaim();
    if (!mine) { toast('Join the town first — then give your home a fresh look.'); return; }
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

  function feedRow(handle, plot, tag) {
    const li = document.createElement('li');
    li.innerHTML = `<span>@${handle}${tag ? ' · ' + tag : ''}</span>`;
    const b = document.createElement('button');
    b.textContent = 'Fly there';
    b.addEventListener('click', () => {
      closeDialogs();
      flyToPlot(plot, 44);
      setTimeout(() => openHouse(plot), 800);
    });
    li.appendChild(b);
    return li;
  }

  function renderFeed() {
    const ul = $('th-feed');
    ul.innerHTML = '';
    ul.appendChild(feedRow(FOUNDER_HANDLE, town.mansionPlot, "Founder's Mansion"));
    const claims = store.claims.slice().sort((a, b) => b.created - a.created).slice(0, 5);
    for (const c of claims) {
      const p = plotById.get(c.plotId);
      if (p) ul.appendChild(feedRow(c.handle, p, districtName(p.district)));
    }
  }

  function renderCollection() {
    const ul = $('collection-list');
    ul.innerHTML = '';
    ul.appendChild(feedRow(FOUNDER_HANDLE, town.mansionPlot, "Founder's Mansion"));
    const claims = store.claims.slice().sort((a, b) => b.created - a.created);
    if (!claims.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No neighbors yet — the town is waiting.';
      ul.appendChild(li);
      return;
    }
    for (const c of claims) {
      const p = plotById.get(c.plotId);
      if (p) ul.appendChild(feedRow(c.handle, p, `${p.number} ${p.street}`));
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
  setTimeout(maybeWelcome, 1600);

  return {
    toast, openHouse, openClaimForPlot, findHouse, flyToPlot, flyToDistrict, flyToLandmark,
    questProgress, refreshStats, route, openWelcome,
  };
}
