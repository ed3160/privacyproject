import * as turf from '@turf/turf';

export const round = (x, d = 5) => Math.round(x * 10 ** d) / 10 ** d;
export const distM = (a, b) => turf.distance(a, b, { units: meters });
const meters = 'meters';

// Remove short out-and-back spurs that appear where a routed waypoint sits a few
// metres off the through-path (the router walks to the waypoint and back on the
// same nodes). A retrace is removed only if it ends within maxOneWayM; longer
// retraces (e.g. the deliberate turnaround of an out-and-back run) are kept.
export function removeSpurs(coords, maxOneWayM = 80, tolM = 2) {
  let pts = coords.filter((p, k) => k === 0 || distM(coords[k - 1], p) > 0.3);
  for (let guard = 0; guard < 200; guard++) {
    let cut = null;
    for (let k = 1; k < pts.length - 1 && !cut; k++) {
      if (distM(pts[k - 1], pts[k + 1]) >= tolM) continue; // not a U-turn apex
      let m = 1, oneWay = distM(pts[k - 1], pts[k]);
      while (k - m - 1 >= 0 && k + m + 1 < pts.length && distM(pts[k - m - 1], pts[k + m + 1]) < tolM) {
        oneWay += distM(pts[k - m - 1], pts[k - m]);
        m++;
        if (oneWay > maxOneWayM) break;
      }
      if (oneWay <= maxOneWayM) cut = [k - m + 1, k + m]; // drop apex..mirror, keep pts[k-m]
    }
    if (!cut) break;
    pts.splice(cut[0], cut[1] - cut[0] + 1);
  }
  return pts;
}

// Resample a line to a near-uniform spacing (metres).
export function densify(coords, stepM) {
  const line = turf.lineString(coords);
  const total = turf.length(line, { units: meters });
  const n = Math.max(2, Math.round(total / stepM) + 1);
  const out = [];
  // walk segments once instead of calling along() n times
  const cum = [0];
  for (let k = 1; k < coords.length; k++) cum.push(cum[k - 1] + distM(coords[k - 1], coords[k]));
  let seg = 1;
  for (let i = 0; i < n; i++) {
    const d = (total * i) / (n - 1);
    while (seg < coords.length - 1 && cum[seg] < d) seg++;
    const d0 = cum[seg - 1], d1 = cum[seg];
    const t = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
    const a = coords[seg - 1], b = coords[seg];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return { coords: out, total };
}

export function cumulative(coords) {
  const cum = [0];
  for (let k = 1; k < coords.length; k++) cum.push(cum[k - 1] + distM(coords[k - 1], coords[k]));
  return cum;
}

// Offset a point by (dx east, dy north) metres.
export function offsetM([lon, lat], dx, dy) {
  return [lon + dx / (111320 * Math.cos((lat * Math.PI) / 180)), lat + dy / 110540];
}

export { turf };
