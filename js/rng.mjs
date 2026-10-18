// Deterministic seeded RNG utilities (mulberry32). Pure, no DOM, no three.js.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) { this.next = mulberry32(seed); }
  // float in [0,1)
  f() { return this.next(); }
  // float in [min,max)
  range(min, max) { return min + this.next() * (max - min); }
  // int in [min,max] inclusive
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
  // pick one item
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  // in-place Fisher-Yates shuffle, returns arr
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  // chance in [0,1)
  chance(p) { return this.next() < p; }
}
