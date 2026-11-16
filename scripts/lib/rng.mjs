// Seeded PRNG (mulberry32) so every run of the generator is identical.
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    uniform: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    normal: (mu = 0, sd = 1) => {
      const u = 1 - next(), v = next();
      return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
  rng.clippedNormal = (mu, sd, lim) => Math.max(mu - lim, Math.min(mu + lim, rng.normal(mu, sd)));
  return rng;
}
