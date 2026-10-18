// Floating name labels: canvas -> texture -> sprite. Browser only (needs document + three).
import * as THREE from 'three';

const INK = '#2b3550';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// text: label string. opts: { bg, fg, scale, pad, fontSize }
export function makeLabel(text, opts = {}) {
  const bg = opts.bg || '#fffdf6';
  const fg = opts.fg || INK;
  const fontSize = opts.fontSize || 44;
  const pad = opts.pad !== undefined ? opts.pad : 26;
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = `800 ${fontSize}px Nunito, sans-serif`;
  const tw = Math.ceil(meas.measureText(text).width);
  const w = tw + pad * 2, h = fontSize + pad * 1.5;
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.font = `800 ${fontSize}px Nunito, sans-serif`;
  ctx.textBaseline = 'middle';
  roundRect(ctx, 3, 3, w - 6, h - 6, (h - 6) / 2);
  ctx.fillStyle = bg; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = fg;
  ctx.fillText(text, pad, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const scale = opts.scale || 0.055;
  sprite.scale.set(w * scale, h * scale, 1);
  return sprite;
}

// Small round dot texture shared by the "everyone else" point cloud.
export function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, '#2b3550');
  g.addColorStop(0.55, '#2b3550');
  g.addColorStop(0.62, 'rgba(255,253,246,0.95)');
  g.addColorStop(1, 'rgba(255,253,246,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
