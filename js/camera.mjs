// Tiny custom orbit camera: drag to rotate, wheel/pinch to zoom, smooth fly-to.
// No three.js addons needed.
import * as THREE from 'three';

const MIN_R = 28, MAX_R = 260;
const MIN_PHI = 0.22, MAX_PHI = 1.38;

export class OrbitCam {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.target = new THREE.Vector3(0, 0, 0);
    this.goalTarget = this.target.clone();
    this.radius = 170; this.goalRadius = 170;
    this.theta = Math.PI * 0.22; this.goalTheta = this.theta;
    this.phi = 0.92; this.goalPhi = this.phi;
    this.autoRotate = false;
    this.lastInteract = 0;
    this._pointers = new Map();
    this._pinchDist = 0;
    this._bind();
  }

  _bind() {
    const el = this.dom;
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        this._pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      this.lastInteract = performance.now();
    });
    el.addEventListener('pointermove', e => {
      const p = this._pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      this.lastInteract = performance.now();
      if (this._pointers.size === 1) {
        this.goalTheta -= dx * 0.0052;
        this.goalPhi = clamp(this.goalPhi - dy * 0.0042, MIN_PHI, MAX_PHI);
      } else if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this._pinchDist > 0) this.goalRadius = clamp(this.goalRadius * (this._pinchDist / d), MIN_R, MAX_R);
        this._pinchDist = d;
      }
    });
    const up = e => { this._pointers.delete(e.pointerId); this._pinchDist = 0; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => {
      e.preventDefault();
      this.goalRadius = clamp(this.goalRadius * (1 + Math.sign(e.deltaY) * 0.09), MIN_R, MAX_R);
      this.lastInteract = performance.now();
    }, { passive: false });
  }

  // Cinematic flight to a point. radius/theta optional.
  flyTo(x, z, radius = 70, theta = null, y = 0) {
    this.goalTarget.set(x, y, z);
    this.goalRadius = clamp(radius, MIN_R, MAX_R);
    if (theta !== null && theta !== undefined) {
      // take the shortest angular path
      let d = (theta - this.goalTheta) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.goalTheta = this.goalTheta + d;
    }
    this.goalPhi = 0.95;
  }

  update(dt, now) {
    if (this.autoRotate && now - this.lastInteract > 4000) {
      this.goalTheta += dt * 0.06;
    }
    const k = 1 - Math.exp(-dt * 3.2); // smooth damping
    this.target.lerp(this.goalTarget, k);
    this.radius += (this.goalRadius - this.radius) * k;
    this.theta += (this.goalTheta - this.theta) * k;
    this.phi += (this.goalPhi - this.phi) * k;
    const sp = Math.sin(this.phi), r = this.radius;
    this.camera.position.set(
      this.target.x + r * sp * Math.sin(this.theta),
      this.target.y + r * Math.cos(this.phi),
      this.target.z + r * sp * Math.cos(this.theta),
    );
    this.camera.lookAt(this.target);
  }
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
