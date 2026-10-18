// Three.js town construction for Maybe Real City.
// buildTown(scene, layout, store) -> town api. Browser only.
import * as THREE from 'three';
import { BODY_PALETTE, ROOF_PALETTE } from './layout.mjs';
import { makeLabel, makeDotTexture } from './labels.mjs';

const INK = 0x2b3550;
const CLAIM_CAP = 64;
export const UPGRADE_DEFS = [
  { tier: 1, name: 'Garden', cost: 60, bonus: 40, desc: 'Bushes and a stepping-stone path.' },
  { tier: 2, name: 'Picket fence', cost: 140, bonus: 90, desc: 'A tidy fence around your plot.' },
  { tier: 3, name: 'Side annex', cost: 260, bonus: 160, desc: 'An extra room with its own little roof.' },
];
export const FLAG_BONUS = 25;

function roofPrismGeometry(hw = 2.45, h = 1.9, hd = 2.15) {
  const v = [
    -hw,0,hd,  hw,0,hd,  0,h,hd,          // front
    hw,0,-hd,  -hw,0,-hd,  0,h,-hd,        // back
    -hw,0,-hd,  -hw,0,hd,  0,h,hd,         // left slope
    -hw,0,-hd,  0,h,hd,  0,h,-hd,
    hw,0,hd,  hw,0,-hd,  0,h,-hd,          // right slope
    hw,0,hd,  0,h,-hd,  0,h,hd,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#fffdf6' : '#e2725b';
    ctx.fillRect(i * 16, 0, 16, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1);
  return t;
}

function houseMatrices(plot) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), plot.rot);
  m.compose(new THREE.Vector3(plot.x, 0, plot.z), q, new THREE.Vector3(1, 1, 1));
  return m;
}

export function buildTown(scene, layout, store) {
  const plotById = new Map(layout.plots.map(p => [p.id, p]));
  const housePlots = layout.plots.filter(p => !p.open);
  const plotIndex = new Map(housePlots.map((p, i) => [p.id, i]));
  const pickables = [];
  const flags = [];   // { mesh, phase }
  const bursts = [];
  let claimSlots = []; // instanceId -> plotId for claimed houses
  const claimLabels = new THREE.Group();
  const claimVisuals = new THREE.Group();
  scene.add(claimLabels, claimVisuals);

  const dummyColor = new THREE.Color();

  // ---------- lights / sky ----------
  scene.background = new THREE.Color(0xfff8ec);
  scene.fog = new THREE.Fog(0xfff3e0, 230, 540);
  const hemi = new THREE.HemisphereLight(0xfffdf6, 0xb7dfa4, 0.85);
  const sun = new THREE.DirectionalLight(0xfff1d8, 1.35);
  sun.position.set(90, 130, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -180; sc.right = 180; sc.top = 180; sc.bottom = -180;
  sc.near = 20; sc.far = 400;
  sun.shadow.bias = -0.0006;
  scene.add(hemi, sun);

  // ---------- ground ----------
  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(210, 48),
    new THREE.MeshLambertMaterial({ color: 0xb7dfa4 })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);

  const flat = (geo, color, x, z, y = 0.06, ry = 0) => {
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = ry;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  // ---------- roads / river / plaza ----------
  flat(new THREE.RingGeometry(56, 64, 72), 0x3a3f4a, 0, 0);
  const dashPts = [];
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    dashPts.push(new THREE.Vector3(Math.cos(a) * 60, 0.14, Math.sin(a) * 60));
  }
  const dashLine = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(dashPts),
    new THREE.LineDashedMaterial({ color: 0xfffdf6, dashSize: 2.2, gapSize: 2.2 })
  );
  dashLine.computeLineDistances();
  scene.add(dashLine);

  flat(new THREE.PlaneGeometry(6, 96), 0x3a3f4a, 0, 0);       // downtown N-S
  flat(new THREE.PlaneGeometry(96, 6), 0x3a3f4a, 0, 0);       // downtown E-W
  flat(new THREE.PlaneGeometry(5, 150), 0xe8dcc8, 126, 0, 0.1);    // riverside walk
  flat(new THREE.PlaneGeometry(4, 160), 0x3a3f4a, -114, 0);   // old town street
  flat(new THREE.CircleGeometry(15, 40), 0xefe6d4, 0, 0, 0.12); // plaza
  flat(new THREE.PlaneGeometry(18, 300), 0x7ec8e3, 112, 0, 0.05); // river
  flat(new THREE.PlaneGeometry(4, 300), 0xe8dcc8, 101, 0, 0.055);
  flat(new THREE.PlaneGeometry(4, 300), 0xe8dcc8, 123, 0, 0.055);
  flat(new THREE.PlaneGeometry(70, 14), 0x4a4f5a, -115, 118, 0.06); // runway
  for (let i = -3; i <= 3; i++) flat(new THREE.PlaneGeometry(3, 0.7), 0xfffdf6, -115 + i * 9, 118, 0.12);

  // ---------- seeded houses (instanced) ----------
  const nH = housePlots.length;
  const bodyGeo = new THREE.BoxGeometry(4.2, 3, 3.6); bodyGeo.translate(0, 1.5, 0);
  const roofGeo = roofPrismGeometry(); roofGeo.translate(0, 3, 0);
  const doorGeo = new THREE.BoxGeometry(0.9, 1.6, 0.15); doorGeo.translate(0, 0.8, 1.83);
  const winGeo = new THREE.BoxGeometry(0.9, 0.9, 0.12);
  const winGeoL = winGeo.clone(); winGeoL.translate(-1.25, 1.9, 1.82);

  const lam = opts => new THREE.MeshLambertMaterial({ color: 0xffffff, ...opts });
  const bodyMesh = new THREE.InstancedMesh(bodyGeo, lam({}), nH);
  const roofMesh = new THREE.InstancedMesh(roofGeo, lam({ flatShading: true }), nH);
  const doorMesh = new THREE.InstancedMesh(doorGeo, lam({}), nH);
  const winMesh = new THREE.InstancedMesh(winGeoL, lam({ color: 0xbfe3ef }), nH * 2);
  for (const m of [bodyMesh, roofMesh, doorMesh, winMesh]) {
    m.castShadow = true; m.receiveShadow = true;
    m.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    scene.add(m);
  }
  bodyMesh.userData.pickKind = 'house';
  pickables.push(bodyMesh);

  housePlots.forEach((p, i) => {
    const M = houseMatrices(p);
    bodyMesh.setMatrixAt(i, M);
    roofMesh.setMatrixAt(i, M);
    doorMesh.setMatrixAt(i, M);
    winMesh.setMatrixAt(i * 2, M);       // left window (geometry has -1.25 x offset baked)
    winMesh.setMatrixAt(i * 2 + 1, M);   // right window slot — fixed up just below
    bodyMesh.setColorAt(i, dummyColor.set(BODY_PALETTE[p.body]));
    roofMesh.setColorAt(i, dummyColor.set(ROOF_PALETTE[p.roof]));
    doorMesh.setColorAt(i, dummyColor.set('#7a5238'));
  });
  // Right window: shift the instance +2.5 in local x (lands at +1.25).
  const offR = new THREE.Matrix4();
  housePlots.forEach((p, i) => {
    // slot i*2 uses winGeoL (left), slot i*2+1 re-uses winGeoL matrix shifted to right
    offR.makeTranslation(2.5, 0, 0).premultiply(new THREE.Matrix4().makeRotationY(p.rot));
    const shifted = new THREE.Matrix4().multiplyMatrices(
      new THREE.Matrix4().makeTranslation(p.x, 0, p.z), offR);
    winMesh.setMatrixAt(i * 2 + 1, shifted);
  });
  for (const m of [bodyMesh, roofMesh, doorMesh, winMesh]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  // dots above seeded houses
  {
    const pos = new Float32Array(nH * 3);
    housePlots.forEach((p, i) => { pos[i * 3] = p.x; pos[i * 3 + 1] = 6.4; pos[i * 3 + 2] = p.z; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({
      size: 4.2, map: makeDotTexture(), transparent: true, depthWrite: false, sizeAttenuation: true,
    }));
    scene.add(pts);
  }

  // ---------- claimed houses (dynamic instanced, cap CLAIM_CAP) ----------
  const cBody = new THREE.InstancedMesh(bodyGeo, lam({}), CLAIM_CAP);
  const cRoof = new THREE.InstancedMesh(roofGeo, lam({ flatShading: true }), CLAIM_CAP);
  const cDoor = new THREE.InstancedMesh(doorGeo, lam({}), CLAIM_CAP);
  const cWin = new THREE.InstancedMesh(winGeoL, lam({ color: 0xbfe3ef }), CLAIM_CAP * 2);
  for (const m of [cBody, cRoof, cDoor, cWin]) {
    m.castShadow = true; m.receiveShadow = true;
    m.count = 0;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
  }
  cBody.userData.pickKind = 'claimed';
  pickables.push(cBody);

  // ---------- towers ----------
  {
    const tg = new THREE.BoxGeometry(1, 1, 1); tg.translate(0, 0.5, 0);
    const tm = new THREE.InstancedMesh(tg, lam({}), layout.towers.length);
    const rm = new THREE.InstancedMesh(tg, lam({}), layout.towers.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
    layout.towers.forEach((t, i) => {
      M.compose(P.set(t.x, 0, t.z), Q.identity(), S.set(t.w, t.h, t.d));
      tm.setMatrixAt(i, M);
      tm.setColorAt(i, dummyColor.set(t.color));
      M.compose(P.set(t.x, t.h, t.z), Q, S.set(t.w * 0.45, t.roofH, t.d * 0.45));
      rm.setMatrixAt(i, M);
      rm.setColorAt(i, dummyColor.set('#8a93a8'));
    });
    tm.castShadow = rm.castShadow = true;
    tm.receiveShadow = true;
    scene.add(tm, rm);
  }

  // ---------- trees ----------
  {
    const trunkG = new THREE.CylinderGeometry(0.28, 0.42, 1.6, 6); trunkG.translate(0, 0.8, 0);
    const folG = new THREE.IcosahedronGeometry(1.9, 0); folG.translate(0, 2.9, 0);
    const trunkM = new THREE.InstancedMesh(trunkG, lam({ color: 0x8a5a44 }), layout.trees.length);
    const folM = new THREE.InstancedMesh(folG, lam({ flatShading: true }), layout.trees.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
    const greens = ['#6faf6f', '#5b9e5f'];
    layout.trees.forEach((t, i) => {
      Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.x * 1.7 + t.z);
      M.compose(P.set(t.x, 0, t.z), Q, S.set(t.s, t.s, t.s));
      trunkM.setMatrixAt(i, M); folM.setMatrixAt(i, M);
      folM.setColorAt(i, dummyColor.set(greens[t.shade]));
    });
    trunkM.castShadow = folM.castShadow = true;
    scene.add(trunkM, folM);
  }

  // ---------- landmarks ----------
  const landmarkHits = [];
  function tagPick(obj, pick) {
    obj.traverse(o => { o.userData.pick = pick; });
    landmarkHits.push(obj);
  }
  const box = (w, h, d, color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam({ color }));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    return m;
  };

  // Town Hall
  {
    const g = new THREE.Group(); g.position.set(0, 0, -34);
    g.add(box(24, 9, 12, '#fff6e9', 0, 4.5, 0));
    const roof = new THREE.Mesh(roofPrismGeometry(), lam({ color: 0xc05a43, flatShading: true }));
    roof.scale.set(4.9, 1.4, 2.9); roof.position.y = 9; roof.castShadow = true; g.add(roof);
    g.add(box(5, 20, 5, '#fff6e9', 0, 10, 0));
    const spire = new THREE.Mesh(new THREE.ConeGeometry(3.8, 3.5, 4), lam({ color: 0xc05a43, flatShading: true }));
    spire.position.y = 21.7; spire.rotation.y = Math.PI / 4; spire.castShadow = true; g.add(spire);
    const face = new THREE.Mesh(new THREE.CircleGeometry(1.7, 24), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    face.position.set(0, 16, 2.56); g.add(face);
    const hand1 = box(0.18, 1.2, 0.06, '#2b3550', 0, 16.3, 2.62);
    const hand2 = box(0.9, 0.18, 0.06, '#2b3550', 0.2, 16, 2.62);
    hand1.castShadow = hand2.castShadow = false; g.add(hand1, hand2);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(26, 0.5, 3.6),
      new THREE.MeshLambertMaterial({ map: stripeTexture() }));
    awn.position.set(0, 4.6, 7.6); awn.castShadow = true; g.add(awn);
    for (const px of [-11, -4, 4, 11]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 4.6, 8), lam({ color: 0x2b3550 }));
      pole.position.set(px, 2.3, 9.1); g.add(pole);
    }
    g.add(box(3.4, 4.4, 0.4, '#2b3550', 0, 2.2, 6.05));
    const label = makeLabel('Town Hall', { bg: '#e8b04b', scale: 0.06 });
    label.position.set(0, 27, 0); g.add(label);
    scene.add(g);
    tagPick(g, { kind: 'landmark', id: 'townhall' });
  }

  // Town Bank
  {
    const g = new THREE.Group(); g.position.set(0, 0, 42);
    g.add(box(16, 8, 10, '#3f7d5d', 0, 4, 0));
    g.add(box(17.5, 1.1, 11.5, '#e8b04b', 0, 8.5, 0));
    for (const px of [-6, -2, 2, 6]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.75, 8, 10), lam({ color: 0xfffdf6 }));
      col.position.set(px, 4, 5.6); col.castShadow = true; g.add(col);
    }
    g.add(box(10, 1, 3, '#e8dcc8', 0, 0.5, 7));
    const label = makeLabel('Town Bank', { bg: '#3f7d5d', fg: '#fffdf6', scale: 0.06 });
    label.position.set(0, 13, 0); g.add(label);
    scene.add(g);
    tagPick(g, { kind: 'landmark', id: 'bank' });
  }

  // Wishing Fountain (animated)
  const fountain = { water: null, top: null };
  {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.2, 1.5, 14), lam({ color: 0xd9d2c4 }));
    base.position.y = 0.75; base.castShadow = base.receiveShadow = true; g.add(base);
    const water = new THREE.Mesh(new THREE.CircleGeometry(3.9, 24),
      new THREE.MeshLambertMaterial({ color: 0x7ec8e3, transparent: true, opacity: 0.9 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 1.55; g.add(water);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.6, 8), lam({ color: 0xd9d2c4 }));
    col.position.y = 2.6; col.castShadow = true; g.add(col);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0x7ec8e3, transparent: true, opacity: 0.85 }));
    top.position.y = 4.4; g.add(top);
    const label = makeLabel('Wishing Fountain', { scale: 0.05 });
    label.position.set(0, 8, 0); g.add(label);
    scene.add(g);
    fountain.water = water; fountain.top = top;
    tagPick(g, { kind: 'fountain' });
  }

  // Cloud Stadium
  {
    const g = new THREE.Group(); g.position.set(105, 0, -95);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(20, 23, 7, 18, 1, true),
      lam({ color: 0xd9d2c4, side: THREE.DoubleSide }));
    bowl.position.y = 3.5; bowl.castShadow = true; g.add(bowl);
    const field = new THREE.Mesh(new THREE.CircleGeometry(17, 24), lam({ color: 0x8fce7e }));
    field.rotation.x = -Math.PI / 2; field.position.y = 0.8; field.receiveShadow = true; g.add(field);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 14, 6), lam({ color: 0x2b3550 }));
      pole.position.set(Math.cos(a) * 24, 7, Math.sin(a) * 24); g.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 0.6),
        new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
      lamp.position.set(Math.cos(a) * 24, 14.4, Math.sin(a) * 24); g.add(lamp);
    }
    const label = makeLabel('Cloud Stadium', { scale: 0.06 });
    label.position.set(0, 19, 0); g.add(label);
    scene.add(g);
    tagPick(g, { kind: 'landmark', id: 'stadium' });
  }

  // Skyport Tower
  {
    const g = new THREE.Group(); g.position.set(-115, 0, 100);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.6, 26, 8), lam({ color: 0xfffdf6 }));
    tower.position.y = 13; tower.castShadow = true; g.add(tower);
    g.add(box(9, 4, 9, '#ddebf7', 0, 28, 0));
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), lam({ color: 0x2b3550 }));
    ant.position.y = 33; g.add(ant);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xe2725b }));
    beacon.position.y = 36.6; g.add(beacon);
    const label = makeLabel('Skyport Tower', { scale: 0.06 });
    label.position.set(0, 41, 0); g.add(label);
    scene.add(g);
    tagPick(g, { kind: 'landmark', id: 'skyport' });
  }

  // ---------- open plot signs + hit areas ----------
  const openHits = [];
  const openSigns = new THREE.Group();
  for (const p of layout.plots.filter(pl => pl.open)) {
    const sign = makeLabel('Open plot', { bg: '#bfe3b4', scale: 0.045, fontSize: 40 });
    sign.position.set(p.x, 5.2, p.z);
    sign.userData.plotId = p.id;
    openSigns.add(sign);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.4, 6), lam({ color: 0x8a5a44 }));
    post.position.set(p.x, 1.7, p.z); post.castShadow = true;
    post.userData.plotId = p.id;
    openSigns.add(post);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 7, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.set(p.x, 3, p.z);
    hit.userData.pick = { kind: 'openplot', id: p.id };
    openHits.push(hit);
    scene.add(hit);
  }
  scene.add(openSigns);
  pickables.push(...openHits, ...landmarkHits);

  // ---------- cars on the ring road ----------
  const cars = [];
  const carColors = [0xe2725b, 0x7ec8e3, 0xe8b04b, 0x9b7ede, 0xbfe3b4, 0xf6e3d3];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const bodyC = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 1.7), lam({ color: carColors[i] }));
    bodyC.position.y = 0.65; bodyC.castShadow = true; g.add(bodyC);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 1.5), lam({ color: 0x2b3550 }));
    cab.position.set(-0.2, 1.5, 0); cab.castShadow = true; g.add(cab);
    scene.add(g);
    cars.push({ g, angle: (i / 6) * Math.PI * 2, speed: 0.055 + (i % 3) * 0.02, dir: i % 2 ? 1 : -1 });
  }

  // ---------- confetti bursts ----------
  function burst(x, z, y = 8) {
    const N = 90;
    const pos = new Float32Array(N * 3);
    const vel = [];
    const cols = [0xe8b04b, 0xe2725b, 0x7ec8e3, 0x9b7ede, 0xbfe3b4];
    const colArr = new Float32Array(N * 3);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 9;
      vel.push([Math.cos(a) * r, 8 + Math.random() * 10, Math.sin(a) * r]);
      c.set(cols[i % cols.length]);
      colArr[i * 3] = c.r; colArr[i * 3 + 1] = c.g; colArr[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.1, vertexColors: true, transparent: true }));
    scene.add(pts);
    bursts.push({ pts, vel, life: 0 });
  }

  // ---------- claimed-house visuals (flag + upgrades) ----------
  function clearGroup(gr) {
    for (let i = gr.children.length - 1; i >= 0; i--) {
      const ch = gr.children[i];
      gr.remove(ch);
      ch.traverse(o => {
        if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); }
        else {
          if (o.geometry) o.geometry.dispose();
          if (o.material && o.material.dispose) o.material.dispose();
        }
      });
    }
  }

  function buildClaimVisual(claim) {
    const p = plotById.get(claim.plotId);
    if (!p) return;
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.rotation.y = p.rot;
    if (claim.flag) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 6), lam({ color: 0x8a5a44 }));
      pole.position.set(3.1, 1.7, 1.2); pole.castShadow = true; g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.05),
        new THREE.MeshLambertMaterial({ color: 0xe2725b, side: THREE.DoubleSide }));
      flag.position.set(4.0, 2.85, 1.2); g.add(flag);
      flags.push({ mesh: flag, phase: Math.random() * 6.28 });
    }
    if (claim.tier >= 1) {
      const bushG = new THREE.SphereGeometry(0.75, 8, 6);
      const bushM = lam({ color: 0x5b9e5f, flatShading: true });
      [[-3.2, 2.6], [-2.2, 3.1], [2.6, 3.0]].forEach(([bx, bz]) => {
        const b = new THREE.Mesh(bushG, bushM);
        b.position.set(bx, 0.6, bz); b.castShadow = true; g.add(b);
      });
      const path = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 4.4), lam({ color: 0xe8dcc8 }));
      path.rotation.x = -Math.PI / 2; path.position.set(0, 0.09, 4.2); path.receiveShadow = true; g.add(path);
    }
    if (claim.tier >= 2) {
      const postG = new THREE.BoxGeometry(0.28, 1.1, 0.28);
      const postM = lam({ color: 0xfffdf6 });
      const railM = lam({ color: 0xfffdf6 });
      const half = 5.2;
      for (let i = -2; i <= 2; i++) {
        const t = (i / 2) * half;
        for (const [px, pz] of [[t, half], [t, -half], [half, t], [-half, t]]) {
          if (Math.abs(px) < 1.2 && pz === half) continue; // gate gap
          const post = new THREE.Mesh(postG, postM);
          post.position.set(px, 0.55, pz); post.castShadow = true; g.add(post);
        }
      }
      for (const z of [half, -half]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.16, 0.16), railM);
        rail.position.set(0, 0.85, z); g.add(rail);
      }
      for (const x of [half, -half]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, half * 2), railM);
        rail.position.set(x, 0.85, 0); g.add(rail);
      }
    }
    if (claim.tier >= 3) {
      const annex = box(2.6, 2.3, 3.2, BODY_PALETTE[claim.body % BODY_PALETTE.length], 3.6, 1.15, 0);
      g.add(annex);
      const ar = new THREE.Mesh(roofPrismGeometry(), lam({ color: ROOF_PALETTE[claim.roof % ROOF_PALETTE.length], flatShading: true }));
      ar.scale.set(0.62, 0.75, 0.85); ar.position.set(3.6, 2.3, 0); ar.castShadow = true; g.add(ar);
    }
    claimVisuals.add(g);
  }

  function refreshClaims() {
    const claims = store.claims.slice(0, CLAIM_CAP);
    claimSlots = [];
    const M = new THREE.Matrix4();
    claims.forEach((claim, i) => {
      const p = plotById.get(claim.plotId);
      if (!p) return;
      M.copy(houseMatrices(p));
      cBody.setMatrixAt(i, M); cRoof.setMatrixAt(i, M); cDoor.setMatrixAt(i, M);
      const offR = new THREE.Matrix4().makeTranslation(2.5, 0, 0)
        .premultiply(new THREE.Matrix4().makeRotationY(p.rot));
      const shifted = new THREE.Matrix4().multiplyMatrices(
        new THREE.Matrix4().makeTranslation(p.x, 0, p.z), offR);
      cWin.setMatrixAt(i * 2, M);
      cWin.setMatrixAt(i * 2 + 1, shifted);
      cBody.setColorAt(i, dummyColor.set(BODY_PALETTE[claim.body % BODY_PALETTE.length]));
      cRoof.setColorAt(i, dummyColor.set(ROOF_PALETTE[claim.roof % ROOF_PALETTE.length]));
      cDoor.setColorAt(i, dummyColor.set('#7a5238'));
      claimSlots[i] = p.id;
    });
    cBody.count = cRoof.count = cDoor.count = claims.length;
    cWin.count = claims.length * 2;
    for (const m of [cBody, cRoof, cDoor, cWin]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    // labels + visuals
    clearGroup(claimLabels);
    clearGroup(claimVisuals);
    flags.length = 0;
    const occupied = new Set(claims.map(c => c.plotId));
    for (const ch of openSigns.children) {
      if (ch.userData.plotId) ch.visible = !occupied.has(ch.userData.plotId);
    }
    for (const h of openHits) {
      h.userData.disabled = occupied.has(h.userData.pick.id);
    }
    claims.forEach(claim => {
      const p = plotById.get(claim.plotId);
      if (!p) return;
      const label = makeLabel('@' + claim.handle, { bg: '#e8b04b', scale: 0.052 });
      label.position.set(p.x, 8.6, p.z);
      claimLabels.add(label);
      buildClaimVisual(claim);
    });
  }

  // ---------- picking ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(clientX, clientY, camera, rect) {
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, true);
    for (const h of hits) {
      const o = h.object;
      if (o.userData.disabled) continue;
      if (o.isInstancedMesh && o.userData.pickKind === 'house') {
        const plot = housePlots[h.instanceId];
        if (plot) return { kind: 'house', plot };
        continue;
      }
      if (o.isInstancedMesh && o.userData.pickKind === 'claimed') {
        const plotId = claimSlots[h.instanceId];
        const plot = plotById.get(plotId);
        if (plot) return { kind: 'house', plot, claimed: true };
        continue;
      }
      let n = o;
      while (n && !n.userData.pick) n = n.parent;
      if (n && n.userData.pick) {
        const pk = n.userData.pick;
        if (pk.kind === 'openplot') return { kind: 'openplot', plot: plotById.get(pk.id) };
        return pk;
      }
    }
    return null;
  }

  // ---------- animation ----------
  const clock = new THREE.Clock();
  function update() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    for (const car of cars) {
      car.angle += car.speed * car.dir * dt;
      car.g.position.set(Math.cos(car.angle) * 60, 0.1, Math.sin(car.angle) * 60);
      car.g.rotation.y = -car.angle + (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI;
    }
    if (fountain.water) fountain.water.rotation.z += dt * 0.8;
    if (fountain.top) {
      const s = 1 + Math.sin(t * 3.2) * 0.12;
      fountain.top.scale.set(s, s, s);
    }
    for (const f of flags) f.mesh.rotation.y = Math.sin(t * 3 + f.phase) * 0.35;
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.life += dt;
      const pos = b.pts.geometry.attributes.position;
      for (let j = 0; j < b.vel.length; j++) {
        b.vel[j][1] -= 22 * dt;
        pos.array[j * 3] += b.vel[j][0] * dt;
        pos.array[j * 3 + 1] = Math.max(0.2, pos.array[j * 3 + 1] + b.vel[j][1] * dt);
        pos.array[j * 3 + 2] += b.vel[j][2] * dt;
      }
      pos.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - b.life / 1.4);
      if (b.life > 1.5) {
        scene.remove(b.pts);
        b.pts.geometry.dispose(); b.pts.material.dispose();
        bursts.splice(i, 1);
      }
    }
  }

  function setQuality(q) {
    if (q === 'low') {
      sun.castShadow = false;
    } else {
      sun.castShadow = true;
    }
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }

  refreshClaims();

  return {
    plotById, housePlots, layout,
    pick, burst, update, refreshClaims, setQuality,
    claimValue(plot, claim) {
      let v = plot.value;
      const lines = [['Plot & build', plot.value]];
      if (claim) {
        for (const u of UPGRADE_DEFS) {
          if (claim.tier >= u.tier) { v += u.bonus; lines.push([u.name, '+' + u.bonus]); }
        }
        if (claim.flag) { v += FLAG_BONUS; lines.push(['Flag flying', '+' + FLAG_BONUS]); }
      }
      return { total: v, lines };
    },
  };
}
