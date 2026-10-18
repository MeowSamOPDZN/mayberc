// Maybe Real City — entry point. ES module, loaded at end of body.
import * as THREE from 'three';
import { buildLayout } from './layout.mjs';
import { buildTown } from './build.mjs';
import { OrbitCam } from './camera.mjs';
import { initUI } from './ui.mjs';
import { store } from './store.mjs';

const STATUS_LINES = [
  'Waking up the town…',
  'Laying the ring road…',
  'Raising the rooftops…',
  'Planting the trees…',
  'Painting nameplates…',
  'Filling the fountain…',
  'Opening the gates…',
];

function setProgress(pct, line) {
  document.getElementById('load-bar-fill').style.width = pct + '%';
  if (line) document.getElementById('load-status').textContent = line;
}
const tick = ms => new Promise(r => setTimeout(r, ms));

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

async function boot() {
  let statusIdx = 0;
  const statusTimer = setInterval(() => {
    statusIdx = (statusIdx + 1) % STATUS_LINES.length;
    document.getElementById('load-status').textContent = STATUS_LINES[statusIdx];
  }, 900);

  try {
    setProgress(8);
    await tick(120);
    if (!webglOK()) throw new Error('webgl-missing');

    setProgress(28, 'Laying the ring road…');
    await tick(60);
    const layout = buildLayout();

    setProgress(52, 'Raising the rooftops…');
    await tick(60);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('scene').appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.5, 1500);
    const cam = new OrbitCam(camera, renderer.domElement);
    cam.radius = 300; cam.goalRadius = 300;
    cam.theta = 0.9; cam.goalTheta = 0.9;

    setProgress(74, 'Planting the trees…');
    await tick(60);
    const town = buildTown(scene, layout, store);

    setProgress(90, 'Painting nameplates…');
    await tick(60);
    const ui = initUI({ town, cam, renderer, layout, store });

    // click (not drag) -> pick something in the town
    let downX = 0, downY = 0, downActive = false;
    renderer.domElement.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; downActive = true; });
    renderer.domElement.addEventListener('pointercancel', () => { downActive = false; });
    renderer.domElement.addEventListener('pointerup', e => {
      if (!downActive) return;
      downActive = false;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 10) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const hit = town.pick(e.clientX, e.clientY, camera, rect);
      if (!hit) return;
      if (hit.kind === 'house') ui.openHouse(hit.plot);
      else if (hit.kind === 'openplot') ui.openClaimForPlot(hit.plot);
      else if (hit.kind === 'fountain') {
        ui.flyToLandmark('fountain');
        ui.questProgress('wish');
        town.burst(0, 0, 5);
        ui.toast('You tossed a wish into the fountain.');
      }
      else if (hit.kind === 'landmark') ui.flyToLandmark(hit.id);
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    setProgress(100, 'Opening the gates…');
    await tick(350);
    clearInterval(statusTimer);
    document.getElementById('loader').classList.add('done');
    document.getElementById('hud').hidden = false;
    cam.flyTo(0, 0, 150); // cinematic zoom-in
    ui.route();

    const loop = () => {
      requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - (loop._last || now)) / 1000);
      loop._last = now;
      cam.update(dt, now);
      town.update();
      renderer.render(scene, camera);
    };
    loop();
  } catch (err) {
    clearInterval(statusTimer);
    document.getElementById('loader').classList.add('done');
    document.getElementById('fallback').hidden = false;
    if (err && err.message !== 'webgl-missing') {
      document.getElementById('fallback-msg').textContent =
        'Something went wrong while building the town (' + String(err && err.message || err) + '). Try reloading in a recent browser.';
    }
  }
}

boot();
