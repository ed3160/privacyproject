#!/usr/bin/env node
// Following Millie — deterministic data generator.
//
//   node scripts/generate-data.mjs            # uses data-cache/ (offline, identical output)
//   node scripts/generate-data.mjs --refresh  # re-fetches routing + elevation into data-cache/
//
// Everything about Millie and every other person here is invented. The only real-world
// inputs are (1) OpenStreetMap street/path geometry via a foot router and (2) USGS
// elevation (NED 10 m) for points on those paths. Both are cached in data-cache/.
// See DATA.md for a plain-language description.

import fs from 'node:fs';
import path from 'node:path';
import { makeRng } from './lib/rng.mjs';
import { removeSpurs, densify, cumulative, offsetM, distM, round, turf } from './lib/geo.mjs';
import { footRoute, elevations } from './lib/sources.mjs';
import { START, WAYPOINTS } from './lib/waypoints.mjs';

const SEED = 20251116;
const OUT = path.resolve('public/data');
fs.mkdirSync(OUT, { recursive: true });
const write = (name, obj) => {
  fs.writeFileSync(path.join(OUT, name), typeof obj === 'string' ? obj : JSON.stringify(obj));
  console.log('  wrote', name, (fs.statSync(path.join(OUT, name)).size / 1024).toFixed(1) + ' KB');
};
// independent streams so changing one dataset doesn't reshuffle the others
const rngFor = (k) => makeRng(SEED + k * 7919);

// ---------------------------------------------------------------------------
// 1a. Routes
// ---------------------------------------------------------------------------
const ROUTE_META = {
  A: { name: 'Weekday loop', summary: 'W 116th St → Riverside Park (lower and upper paths) → W 122nd St → Amsterdam Ave → Morningside Park → Broadway' },
  B: { name: 'Sunday long run', summary: 'Out-and-back south through Riverside Park to about W 75th St' },
  C: { name: 'Short Morningside loop', summary: 'W 112th St → Cathedral Pkwy → Morningside Park → 116th St stairs → Morningside Dr → W 120th St' },
};
const STEP_M = 7.5; // dense spacing
const ELEV_STEP_M = 25; // elevation sample spacing

console.log('Routes');
const routes = {};
for (const id of Object.keys(WAYPOINTS)) {
  const raw = await footRoute(WAYPOINTS[id]);
  const clean = removeSpurs(raw.coordinates);
  const { coords } = densify(clean, STEP_M);
  const cum = cumulative(coords);
  const total = cum[cum.length - 1]; // use the resampled length everywhere so all numbers agree
  // elevation: sample every ~25 m, interpolate, light smoothing
  const every = Math.round(ELEV_STEP_M / STEP_M);
  const sIdx = coords.map((_, i) => i).filter((i) => i % every === 0 || i === coords.length - 1);
  const sEle = await elevations(sIdx.map((i) => coords[i]));
  let ele = coords.map((_, i) => {
    let k = sIdx.findIndex((s) => s >= i);
    if (sIdx[k] === i) return sEle[k];
    const i0 = sIdx[k - 1], i1 = sIdx[k];
    return sEle[k - 1] + ((sEle[k] - sEle[k - 1]) * (i - i0)) / (i1 - i0);
  });
  ele = ele.map((_, i) => {
    const w = ele.slice(Math.max(0, i - 2), i + 3);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
  let gain = 0;
  for (let k = 1; k < sIdx.length; k++) gain += Math.max(0, ele[sIdx[k]] - ele[sIdx[k - 1]]);
  routes[id] = { id, coords, cum, ele, total, gain };
  console.log(`  ${id}: ${(total / 1000).toFixed(2)} km, +${gain.toFixed(0)} m, ${coords.length} pts`);
}

const routesFC = {
  type: 'FeatureCollection',
  features: Object.values(routes).map((r) => {
    const simp = turf.simplify(turf.lineString(r.coords), { tolerance: 0.00002, highQuality: true });
    return {
      type: 'Feature',
      properties: {
        id: r.id, ...ROUTE_META[r.id],
        distance_m: Math.round(r.total), elevation_gain_m: Math.round(r.gain),
        min_ele_m: round(Math.min(...r.ele), 1), max_ele_m: round(Math.max(...r.ele), 1),
      },
      geometry: { type: 'LineString', coordinates: simp.geometry.coordinates.map(([x, y]) => [round(x), round(y)]) },
    };
  }),
};

// ---------------------------------------------------------------------------
// 1b. Activity history (Nov 16 2025 → Nov 15 2026)
// ---------------------------------------------------------------------------
console.log('Activities');
const rA = rngFor(1);
const DAY = 86400000;
const FIRST = Date.UTC(2025, 10, 16);
const LAST = Date.UTC(2026, 10, 15);
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const inRange = (d, a, b) => d >= a && d <= b;
const GAPS = [
  { id: 'winter-break', label: 'Winter break', start: '2025-12-19', end: '2026-01-10', kind: 'none',
    note: 'No runs for about three weeks.' },
  { id: 'spring-finals', label: 'Spring finals', start: '2026-05-04', end: '2026-05-14', kind: 'sparse',
    note: 'About ten days with only occasional runs.' },
  { id: 'summer-gap', label: 'Unexplained summer gap', start: '2026-07-11', end: '2026-07-25', kind: 'none',
    note: 'Two weeks with no runs and no obvious reason.' },
];
// New York local time offset (DST 2026-03-08 → 2026-11-01).
const nyOffset = (d) => (d >= '2026-03-08' && d < '2026-11-01' ? '-04:00' : '-05:00');
const HERO_DATE = '2026-11-12'; // a Thursday

const schedule = [];
for (let t = FIRST; t <= LAST; t += DAY) {
  const d = iso(t);
  const dow = new Date(t).getUTCDay();
  const gap = GAPS.find((g) => inRange(d, g.start, g.end));
  let slot = null;
  if (dow === 2 || dow === 4) slot = 'weekday-am';
  if (dow === 0) slot = 'sunday-pm';
  // draw every random number regardless of outcome so streams stay aligned
  const skipDraw = rA.next(), gapDraw = rA.next(), routeDraw = rA.next();
  const tDraw = slot === 'weekday-am' ? rA.clippedNormal(0, 10, 20) : rA.clippedNormal(0, 22, 45);
  const extraDraw = rA.next(), extraRoute = rA.next(), extraHour = rA.uniform(8, 19);
  if (d === HERO_DATE) { schedule.push({ d, dow, slot, route: 'A', minutes: 7 * 60 + 4, tags: ['hero'] }); continue; }
  if (slot) {
    if (gap && gap.kind === 'none') continue;
    if (gap && gap.kind === 'sparse' && gapDraw > 0.3) continue;
    if (skipDraw < 0.1) continue;
    const route = slot === 'weekday-am' ? (routeDraw < 0.7 ? 'A' : 'C') : (routeDraw < 0.85 ? 'B' : 'A');
    const base = slot === 'weekday-am' ? 7 * 60 : 15 * 60;
    schedule.push({ d, dow, slot, route, minutes: Math.round(base + tDraw), tags: gap ? [gap.id] : [] });
  } else if (!gap && (dow === 3 || dow === 6) && extraDraw < 0.08) {
    schedule.push({ d, dow, slot: 'extra', route: extraRoute < 0.6 ? 'C' : 'A', minutes: Math.round(extraHour * 60), tags: ['one-off'] });
  }
}

const fmtPace = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
function jitterPoint(p, rng, sd = 12, lim = 30) {
  let dx, dy;
  do { dx = rng.normal(0, sd); dy = rng.normal(0, sd); } while (Math.hypot(dx, dy) > lim);
  return offsetM(p, dx, dy);
}
function pointAt(r, dM) {
  let k = r.cum.findIndex((c) => c >= dM);
  if (k <= 0) return r.coords[Math.max(0, k)];
  const t = (dM - r.cum[k - 1]) / (r.cum[k] - r.cum[k - 1]);
  const a = r.coords[k - 1], b = r.coords[k];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
// per-km relative pace factor from the route's terrain
function gradeFactors(r) {
  const f = [];
  for (let i = 0; i < r.coords.length; i++) {
    const j0 = Math.max(0, i - 2), j1 = Math.min(r.coords.length - 1, i + 2);
    const dd = r.cum[j1] - r.cum[j0] || 1;
    const g = (r.ele[j1] - r.ele[j0]) / dd;
    f.push(g > 0 ? Math.min(2.2, 1 + 3.3 * g) : Math.max(0.92, 1 + 1.5 * g));
  }
  return f;
}
for (const r of Object.values(routes)) r.factor = gradeFactors(r);

const activities = schedule.map((s, idx) => {
  const r = routes[s.route];
  const progress = (Date.parse(s.d) - FIRST) / (LAST - FIRST);
  const month = +s.d.slice(5, 7);
  const summer = month === 7 || month === 8;
  const routeAdj = { A: 0, B: 12, C: -6 }[s.route];
  const pace = 386 - 30 * progress + routeAdj + (summer ? 6 : 0) + rA.normal(0, 7); // s/km
  const distance = r.total + rA.normal(0, 12);
  const moving = Math.round((distance / 1000) * pace);
  const avgHr = Math.round(157 - 8 * progress + (s.route === 'B' ? 3 : 0) + (summer ? 4 : 0) + rA.normal(0, 3));
  const maxHr = Math.round(avgHr + (s.route === 'B' ? 16 : 22) + rA.normal(0, 3));
  // splits: terrain-weighted
  const splits = [];
  for (let km = 0; km * 1000 < distance; km++) {
    const a = km * 1000, b = Math.min(distance, (km + 1) * 1000);
    const idxs = r.cum.map((c, i) => [c, i]).filter(([c]) => c >= a && c < b).map(([, i]) => i);
    const fac = idxs.length ? idxs.reduce((x, i) => x + r.factor[i], 0) / idxs.length : 1;
    const meanFac = r.factor.reduce((x, y) => x + y, 0) / r.factor.length;
    splits.push({ km: km + 1, distance_m: Math.round(b - a), pace_s_per_km: Math.round((pace * fac) / meanFac + rA.normal(0, 5)) });
  }
  const hh = Math.floor(s.minutes / 60), mm = s.minutes % 60, ss = rA.int(0, 59);
  const start = `${s.d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}${nyOffset(s.d)}`;
  const startPt = jitterPoint(START, rA), endPt = jitterPoint(START, rA);
  // where the visible track begins/ends under the default 200 m hide
  const vs = jitterPoint(pointAt(r, 200), rA, 3, 8), ve = jitterPoint(pointAt(r, r.total - 200), rA, 3, 8);
  return {
    id: `run-${String(idx + 1).padStart(3, '0')}`,
    start, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.dow], slot: s.slot, route: s.route,
    distance_m: Math.round(distance), moving_time_s: moving,
    avg_pace_s_per_km: Math.round(pace), avg_pace: fmtPace(pace),
    elevation_gain_m: Math.max(0, Math.round(r.gain + rA.normal(0, 1.5))),
    avg_hr: avgHr, max_hr: maxHr, splits,
    start_point: startPt.map((x) => round(x)), end_point: endPt.map((x) => round(x)),
    visible_start_200m: vs.map((x) => round(x)), visible_end_200m: ve.map((x) => round(x)),
    tags: s.tags,
  };
});
// the first upload happens before the 200 m default kicks in (Strava, n.d., privacy defaults)
activities[0].tags.push('first-upload-unhidden');

// ---------------------------------------------------------------------------
// Hero run: full-resolution series (route A, Thu 2026-11-12)
// ---------------------------------------------------------------------------
const rH = rngFor(2);
const heroAct = activities.find((a) => a.tags.includes('hero'));
const RA = routes.A;
{
  const n = RA.coords.length;
  // smooth AR(1) noise on pace
  let z = 0;
  const raw = RA.factor.map((f) => { z = 0.9 * z + rH.normal(0, 0.012); return f * (1 + z); });
  const target = heroAct.avg_pace_s_per_km;
  const segTimes = raw.map((f, i) => (i === 0 ? 0 : ((RA.cum[i] - RA.cum[i - 1]) / 1000) * f));
  const scale = (target * (RA.total / 1000)) / segTimes.reduce((a, b) => a + b, 0);
  const t = [0];
  for (let i = 1; i < n; i++) t.push(t[i - 1] + segTimes[i] * scale);
  // heart rate: ramp from ~100, lag toward a target driven by climbing + drift
  const hr = [];
  let h = 100, g2 = 0;
  for (let i = 0; i < n; i++) {
    const j0 = Math.max(0, i - 3), j1 = Math.min(n - 1, i + 3);
    const grade = (RA.ele[j1] - RA.ele[j0]) / (RA.cum[j1] - RA.cum[j0] || 1);
    g2 = 0.85 * g2 + 0.15 * Math.max(0, grade);
    const dt = i ? t[i] - t[i - 1] : 0;
    const tgt = 147 + 300 * g2 + 0.12 * (t[i] / 60) + rH.normal(0, 1.2);
    h += (tgt - h) * (1 - Math.exp(-dt / 22));
    hr.push(Math.round(Math.max(95, Math.min(192, h))));
  }
  const hero = {
    activity_id: heroAct.id, route: 'A', start: heroAct.start, step_m: STEP_M,
    lon: RA.coords.map((p) => round(p[0], 6)), lat: RA.coords.map((p) => round(p[1], 6)),
    ele_m: RA.ele.map((e) => round(e, 1)), dist_m: RA.cum.map((c) => round(c, 1)),
    time_s: t.map((x) => Math.round(x)), hr_bpm: hr,
  };
  // keep the activity summary consistent with the series
  heroAct.moving_time_s = hero.time_s[n - 1];
  heroAct.distance_m = Math.round(RA.total);
  heroAct.avg_hr = Math.round(hr.reduce((a, b) => a + b, 0) / n);
  heroAct.max_hr = Math.max(...hr);
  const iMax = hr.indexOf(heroAct.max_hr);
  hero.max_hr_index = iMax;
  heroAct.splits = [];
  for (let km = 0; km * 1000 < RA.total; km++) {
    const i0 = RA.cum.findIndex((c) => c >= km * 1000);
    let i1 = RA.cum.findIndex((c) => c >= (km + 1) * 1000); if (i1 < 0) i1 = n - 1;
    const dm = RA.cum[i1] - RA.cum[i0];
    heroAct.splits.push({ km: km + 1, distance_m: Math.round(dm), pace_s_per_km: Math.round((t[i1] - t[i0]) / (dm / 1000)),
      avg_hr: Math.round(hr.slice(i0, i1 + 1).reduce((a, b) => a + b, 0) / (i1 - i0 + 1)) });
  }
  heroAct.avg_pace_s_per_km = Math.round(heroAct.moving_time_s / (RA.total / 1000));
  heroAct.avg_pace = fmtPace(heroAct.avg_pace_s_per_km);
  heroAct.elevation_gain_m = Math.round(RA.gain);
  write('hero-run.json', hero);

  // GPX export of the hero run
  const t0 = Date.parse(heroAct.start);
  const trkpts = RA.coords.map((p, i) => `      <trkpt lat="${p[1].toFixed(6)}" lon="${p[0].toFixed(6)}"><ele>${RA.ele[i].toFixed(1)}</ele><time>${new Date(t0 + hero.time_s[i] * 1000).toISOString().replace('.000', '')}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${hr[i]}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`).join('\n');
  write('millie-run.gpx', `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="following-millie generate-data.mjs (SIMULATED DATA)" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata><name>Millie — Thursday morning run (fictional, simulated)</name><desc>Simulated track for a class project. Street geometry © OpenStreetMap contributors; elevation USGS NED 10 m via OpenTopoData. Person, time and heart rate are invented.</desc></metadata>
  <trk><name>Morning Run</name><type>running</type><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>
`);
}

write('routes.geojson', routesFC);
write('activities.json', { generated_by: 'scripts/generate-data.mjs', seed: SEED, timezone: 'America/New_York',
  range: { start: iso(FIRST), end: iso(LAST) }, gaps: GAPS, activities });

// ---------------------------------------------------------------------------
// 1c. Profiles and settings
// ---------------------------------------------------------------------------
const profile = {
  fictional: true,
  display_name: 'Millie Bear',
  avatar: { type: 'initials', text: 'MB' },
  school: 'Barnard College',
  hometown: 'Brooklyn, NY', location: 'New York, NY',
  bio: 'Barnard · cog sci · slow miles, good coffee. Brooklyn → Morningside.',
  member_since: '2025-11',
  followers_count: 10, following_count: 14,
  visibility: { profile: 'everyone', activities: 'everyone' },
};
const followers = [
  { handle: 'priya.r', name: 'Priya Ramaswamy-Cole', relation: 'roommate', recognized: true },
  { handle: 'jonah_runs', name: 'Jonah Feld', relation: 'friend from high school', recognized: true },
  { handle: 'tess.okafor', name: 'Tess Okafor-Lind', relation: 'classmate', recognized: true },
  { handle: 'marguerite.b', name: 'Marguerite Bear', relation: 'aunt', recognized: true },
  { handle: 'dbear', name: 'Daniel Bear', relation: 'father', recognized: true },
  { handle: 'lena.v', name: 'Lena Vasquez-Hart', relation: 'friend', recognized: true },
  { handle: 'sam.ito', name: 'Sam Itoh', relation: 'lab partner', recognized: true },
  { handle: 'ruthie.k', name: 'Ruthie Kessler', relation: 'cousin', recognized: true },
  { handle: 'athlete_80412', name: 'athlete_80412', relation: null, recognized: false, note: 'No photo, no activities, joined recently.' },
  { handle: 'r.m.k', name: 'R. K.', relation: null, recognized: false, note: 'Follows hundreds of accounts; no mutual followers.' },
].map((f) => ({ ...f, fictional: true, avatar: { type: 'initials', text: f.name.split(/[\s.-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') } }));
const proProfile = {
  fictional: true,
  name: 'Millie Bear',
  headline: 'Cognitive Science @ Barnard College | Research Assistant',
  school: 'Barnard College', degree: 'B.A., Cognitive Science', class_year: 2027,
  location: 'New York City Metropolitan Area',
  high_school: { name: 'Midwood High School', location: 'Brooklyn, NY' },
  experience: [
    { title: 'Research Intern', org: 'Halverson Lab', dates: 'Jun 2026 – Aug 2026' },
    { title: 'Program Intern', org: 'Linden Arts Center', dates: 'Jun 2025 – Aug 2025' },
  ],
  skills: ['Research', 'Data entry', 'Spreadsheets'],
  activities: ['Undergraduate Mind & Brain Society (fictional)'],
  joinable_with_fitness_profile: ['name', 'school'],
};
const settingsDefaults = {
  note: 'Strava defaults as described on Strava Support pages, checked 2026-11-16. The site reads this file to build the settings panel.',
  options: [
    { id: 'activity-visibility', label: 'Who can see your activities', type: 'choice', default: 'everyone',
      choices: ['everyone', 'followers', 'only_you'], appliesTo: 'per activity (default for new uploads)', source: 'strava-defaults' },
    { id: 'profile-visibility', label: 'Who can see your profile page', type: 'choice', default: 'everyone',
      choices: ['everyone', 'followers'], appliesTo: 'profile', source: 'strava-profile' },
    { id: 'hide-start-end', label: 'Hide start and end of activities', type: 'toggle', default: true, distance_m: 200,
      appliesTo: 'future activities only', source: 'strava-map' },
    { id: 'address-zone', label: 'Hide map near an address', type: 'toggle', default: false,
      appliesTo: 'past and future activities', source: 'strava-map' },
    { id: 'hide-map', label: 'Hide the entire map', type: 'toggle', default: false,
      appliesTo: 'future activities only', source: 'strava-map' },
    { id: 'heatmap-opt-out', label: 'Leave Global Heatmap & Metro', type: 'toggle', default: false,
      appliesTo: 'aggregate products', source: 'strava-heatmap' },
    { id: 'hide-hr', label: 'Hidden details: heart rate', type: 'toggle', default: false,
      appliesTo: 'new uploads (can be applied to past activities separately)', source: 'strava-hidden' },
    { id: 'hide-start-time', label: 'Hidden details: start time', type: 'toggle', default: false,
      appliesTo: 'new uploads', source: 'strava-hidden' },
  ],
};
write('profile.json', profile);
write('followers.json', followers);
write('pro-profile.json', proProfile);
write('settings-defaults.json', settingsDefaults);

// ---------------------------------------------------------------------------
// 1d. Aggregate heatmap simulations
// ---------------------------------------------------------------------------
console.log('Heatmap (dense)');
const rD = rngFor(3);
const BBOX = [-73.9725, 40.7990, -73.9530, 40.8170];
const PARK_ANCHORS = [
  [-73.96676, 40.81007], [-73.96511, 40.81120], [-73.9700, 40.8040], [-73.9720, 40.8010], // Riverside Park
  [-73.95883, 40.80574], [-73.95870, 40.80330], [-73.95973, 40.80207], // Morningside Park
];
const denseTracks = [];
for (let k = 0; k < 300; k++) {
  const start = [rD.uniform(BBOX[0], BBOX[2]), rD.uniform(BBOX[1], BBOX[3])];
  const nWp = rD.int(2, 4);
  const wps = [start];
  for (let j = 0; j < nWp; j++) {
    if (rD.chance(0.45)) wps.push(offsetM(rD.pick(PARK_ANCHORS), rD.normal(0, 60), rD.normal(0, 60)));
    else wps.push(offsetM(start, rD.normal(0, 650), rD.normal(0, 650)));
  }
  wps.push(start);
  const runs = Math.max(1, Math.min(150, Math.round(Math.exp(rD.normal(Math.log(14), 0.9)))));
  const r = await footRoute(wps);
  const simp = turf.simplify(turf.lineString(r.coordinates), { tolerance: 0.00002 });
  denseTracks.push({ type: 'Feature', properties: { who: 'other', runs },
    geometry: { type: 'LineString', coordinates: simp.geometry.coordinates.map(([x, y]) => [round(x), round(y)]) } });
  if (k % 50 === 49) console.log(`  ${k + 1}/300`);
}
for (const id of ['A', 'B', 'C']) {
  denseTracks.push({ type: 'Feature', properties: { who: 'millie', route: id, runs: activities.filter((a) => a.route === id).length },
    geometry: routesFC.features.find((f) => f.properties.id === id).geometry });
}
write('heatmap-dense.geojson', { type: 'FeatureCollection', bbox: BBOX,
  properties: { note: 'Simulated. 300 fictional runners routed on real OSM paths plus Millie\'s three routes. "runs" = how many times that track was recorded.' },
  features: denseTracks });

console.log('Heatmap (sparse)');
const rS = rngFor(4);
// Fictional, unlabeled place in a local metre grid (x east, y north). NOT geographic coordinates.
const rect = (w, h, ox = 0, oy = 0) => [[ox, oy], [ox + w, oy], [ox + w, oy + h], [ox, oy + h], [ox, oy]];
const rot = ([x, y], a = (14 * Math.PI) / 180) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
function wobble(line, sd) {
  // densify to ~10 m and add smooth lateral noise
  const out = [];
  let z = [0, 0];
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10));
    for (let s = 0; s < n; s++) {
      z = [0.8 * z[0] + rS.normal(0, sd), 0.8 * z[1] + rS.normal(0, sd)];
      out.push([a[0] + ((b[0] - a[0]) * s) / n + z[0], a[1] + ((b[1] - a[1]) * s) / n + z[1]]);
    }
  }
  out.push(line[line.length - 1]);
  return out.map((p) => rot(p).map((v) => Math.round(v * 10) / 10));
}
const sparseShapes = [
  ...Array.from({ length: 8 }, () => ({ kind: 'perimeter', line: rect(900, 600) })),
  ...Array.from({ length: 3 }, () => ({ kind: 'inner-road', line: [[0, 300], [900, 300]] })),
  ...Array.from({ length: 2 }, () => ({ kind: 'inner-road', line: [[450, 0], [450, 600]] })),
  ...Array.from({ length: 3 }, () => ({ kind: 'block-loop', line: rect(220, 160, 560, 360) })),
  ...Array.from({ length: 2 }, () => ({ kind: 'access-road', line: [[450, 0], [450, -420], [450, 0]] })),
  { kind: 'partial', line: [[0, 0], [900, 0], [900, 300], [450, 300]] },
  { kind: 'partial', line: [[120, 600], [120, 150], [330, 150], [330, 600]] },
];
const sparseFC = { type: 'FeatureCollection',
  properties: { crs: 'local-metres', note: 'Fictional, unlabeled remote site. Coordinates are metres on a local grid, not longitude/latitude.' },
  features: sparseShapes.map((s) => ({ type: 'Feature', properties: { kind: s.kind, runs: rS.int(15, 70) },
    geometry: { type: 'LineString', coordinates: wobble(s.line, 1.6) } })) };
write('heatmap-sparse.geojson', sparseFC);

// ---------------------------------------------------------------------------
// 1e. Evidence numbers (computed) → claims ledger
// ---------------------------------------------------------------------------
console.log('Claims');
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const nRuns = activities.length;
const center = [median(activities.map((a) => a.start_point[0])), median(activities.map((a) => a.start_point[1]))];
const startDists = activities.map((a) => distM(center, a.start_point));
const endDists = activities.map((a) => distM(center, a.end_point));
const within60 = activities.filter((a, i) => startDists[i] <= 60 && endDists[i] <= 60).length;
const p95 = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)];
const visStarts = activities.filter((a) => !a.tags.includes('first-upload-unhidden')).flatMap((a) => [a.visible_start_200m, a.visible_end_200m]);
const visCentroid = [visStarts.reduce((s, p) => s + p[0], 0) / visStarts.length, visStarts.reduce((s, p) => s + p[1], 0) / visStarts.length];
const visDists = visStarts.map((p) => distM(center, p));
const firstRun = activities[0];

const hourOf = (a) => +a.start.slice(11, 13) + +a.start.slice(14, 16) / 60;
const amRuns = activities.filter((a) => a.weekday === 'Tue' || a.weekday === 'Thu');
const amInWindow = amRuns.filter((a) => hourOf(a) >= 6 + 40 / 60 && hourOf(a) <= 7 + 20 / 60).length;
const sunRuns = activities.filter((a) => a.weekday === 'Sun');
const sunInWindow = sunRuns.filter((a) => hourOf(a) >= 14.25 && hourOf(a) <= 15.75).length;
const scheduledShare = activities.filter((a) => a.slot !== 'extra').length;
// gaps of ≥ 10 days between consecutive runs
const dates = activities.map((a) => Date.parse(a.start.slice(0, 10)));
const longGaps = [];
for (let i = 1; i < dates.length; i++) {
  const days = Math.round((dates[i] - dates[i - 1]) / DAY) - 1;
  if (days >= 10) longGaps.push({ after: iso(dates[i - 1]), before: iso(dates[i]), days });
}
const avgPace = (xs) => xs.reduce((s, a) => s + a.avg_pace_s_per_km, 0) / xs.length;
const firstQ = activities.filter((a) => a.start < '2026-02-16'), lastQ = activities.filter((a) => a.start >= '2026-08-16');
const routeCounts = Object.fromEntries(['A', 'B', 'C'].map((id) => [id, activities.filter((a) => a.route === id).length]));
const parkRuns = activities.length; // every route passes Riverside or Morningside Park
const heroEleMin = Math.min(...RA.ele), heroEleMax = Math.max(...RA.ele);
const heroData = JSON.parse(fs.readFileSync(path.join(OUT, 'hero-run.json'), 'utf8'));
const iMax = heroData.max_hr_index;
const maxHrKm = (heroData.dist_m[iMax] / 1000).toFixed(1);
// is the HR peak near the Morningside Park stairs?
const stairs = [-73.95883, 40.80574];
const peakNearStairs = distM([heroData.lon[iMax], heroData.lat[iMax]], stairs);
// heatmap cover: share of Millie's route-A points that sit within 15 m of ≥5 other runners' tracks
const others = denseTracks.filter((f) => f.properties.who === 'other');
const sampleA = RA.coords.filter((_, i) => i % 8 === 0);
const covered = sampleA.filter((p) => {
  let c = 0;
  for (const f of others) {
    if (turf.pointToLineDistance(p, f, { units: 'meters' }) <= 15) c++;
    if (c >= 5) return true;
  }
  return false;
}).length;
const coverShare = Math.round((100 * covered) / sampleA.length);
const sparseRuns = sparseFC.features.reduce((s, f) => s + f.properties.runs, 0);

const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const fmtTime = (s) => `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;

const ev = {
  n_runs: nRuns, within60, p95_start_m: Math.round(p95(startDists)),
  vis_min_m: Math.round(Math.min(...visDists)), vis_max_m: Math.round(Math.max(...visDists)),
  vis_centroid_offset_m: Math.round(distM(center, visCentroid)),
  am_total: amRuns.length, am_in_window: amInWindow, sun_total: sunRuns.length, sun_in_window: sunInWindow,
  scheduled: scheduledShare, extras: nRuns - scheduledShare, long_gaps: longGaps,
  pace_first: fmtPace(avgPace(firstQ)), pace_last: fmtPace(avgPace(lastQ)),
  route_counts: routeCounts, park_runs: parkRuns,
  hero: { distance_km: +(heroAct.distance_m / 1000).toFixed(2), time: fmtTime(heroAct.moving_time_s), pace: heroAct.avg_pace,
    avg_hr: heroAct.avg_hr, max_hr: heroAct.max_hr, max_hr_km: +maxHrKm, peak_near_stairs_m: Math.round(peakNearStairs),
    ele_min: Math.round(heroEleMin), ele_max: Math.round(heroEleMax), gain: heroAct.elevation_gain_m, date: fmtDate(HERO_DATE) },
  first_run_date: fmtDate(firstRun.start.slice(0, 10)),
  heatmap_cover_pct: coverShare, heatmap_dense_tracks: others.length,
  heatmap_dense_runs: others.reduce((s, f) => s + f.properties.runs, 0), sparse_tracks: sparseFC.features.length, sparse_runs: sparseRuns,
};
const finals = GAPS.find((g) => g.id === 'spring-finals');
const finalsRuns = activities.filter((a) => inRange(a.start.slice(0, 10), finals.start, finals.end)).length;
const finalsDays = Math.round((Date.parse(finals.end) - Date.parse(finals.start)) / DAY) + 1;
ev.finals = { runs: finalsRuns, days: finalsDays };
const gapText = longGaps.map((g) => `${g.days} days with no runs after ${fmtDate(g.after)}`).join('; ') + `; and only ${finalsRuns} run${finalsRuns === 1 ? '' : 's'} in ${finalsDays} days from ${fmtDate(finals.start)}`;

const claims = [
  // --- the run
  { id: 'run-route', section: 'run', level: 'observed',
    claim: 'The route, distance, time and date of one Thursday-morning run.',
    evidence: `Public activity: ${ev.hero.distance_km} km in ${ev.hero.time} on ${ev.hero.date}, starting ${heroAct.start.slice(11, 16)}.`,
    citations: ['strava-defaults'], mitigatedBy: ['activity-followers', 'activity-only-you', 'hide-map'],
    stillLeaks: 'Followers-only still shows the run to every follower, including the two accounts she doesn’t recognize. Hiding the map leaves the stats visible.' },
  // --- home
  { id: 'home-first-run', section: 'home', level: 'observed',
    claim: 'Her very first activity shows exactly where she pressed start and stop.',
    evidence: `Run 1 (${ev.first_run_date}) was uploaded before the 200 m default took effect, so its endpoints are visible.`,
    citations: ['strava-map', 'strava-defaults'], mitigatedBy: ['address-zone', 'activity-only-you'],
    stillLeaks: 'Hide start/end and Hide entire map only apply to future activities. Only the address option reaches back to old runs.' },
  { id: 'home-cluster', section: 'home', level: 'inferred',
    claim: 'She lives, studies or spends her mornings near Broadway & W 117th St.',
    evidence: `${ev.within60} of ${ev.n_runs} runs start and end within 60 m of the same point (95% of starts within ${ev.p95_start_m} m).`,
    citations: ['strava-map', 'meteriz2024'], mitigatedBy: ['address-zone', 'activity-only-you'],
    stillLeaks: 'With Followers-only, followers still see the pattern. Any hidden circle is still centred on the place it protects.' },
  { id: 'home-ring', section: 'home', level: 'inferred',
    claim: 'Even with the 200 m default on, the hidden circle points back to the same block.',
    evidence: `Visible tracks begin ${ev.vis_min_m}–${ev.vis_max_m} m from the true start; the average of those points is only ${ev.vis_centroid_offset_m} m from it.`,
    citations: ['strava-map'], mitigatedBy: ['activity-only-you', 'hide-map'],
    stillLeaks: 'A bigger hidden radius widens the circle but keeps its centre. Hide entire map works for future runs only.' },
  { id: 'home-elevation', section: 'home', level: 'inferred',
    claim: 'Her elevation profile alone can help place a run in a city or borough.',
    evidence: `The run climbs from ${ev.hero.ele_min} m by the river to ${ev.hero.ele_max} m on the ridge, a profile research models have used to predict location.`,
    citations: ['meteriz2024'], mitigatedBy: ['activity-followers', 'activity-only-you'],
    stillLeaks: 'Hiding the start/end, or a whole map, does not remove the elevation chart from the stats as far as we could confirm.' },
  { id: 'home-building', section: 'home', level: 'unsupported',
    claim: 'Which building she lives in.',
    evidence: 'Her starts cluster on a campus block. Where someone presses “record” isn’t necessarily their door, and the data can’t tell the difference.',
    citations: [], mitigatedBy: ['address-zone', 'activity-only-you'], stillLeaks: '' },
  // --- routine
  { id: 'routine-weekly', section: 'routine', level: 'inferred',
    claim: 'She runs Tuesday and Thursday mornings around 7:00, and Sunday afternoons around 3:00.',
    evidence: `${ev.am_in_window} of ${ev.am_total} Tue/Thu runs start between 6:40 and 7:20; ${ev.sun_in_window} of ${ev.sun_total} Sunday runs start between 2:15 and 3:45 p.m.`,
    citations: ['strava-privacy'], mitigatedBy: ['activity-followers', 'activity-only-you', 'hide-start-time'],
    stillLeaks: 'Hiding the start time still leaves the date and weekday, so the Tue/Thu/Sun rhythm stays visible.' },
  { id: 'routine-places', section: 'routine', level: 'observed',
    claim: 'The parks and streets she passes again and again.',
    evidence: `All ${ev.n_runs} runs go through Riverside Park or Morningside Park; route A alone appears ${ev.route_counts.A} times.`,
    citations: [], mitigatedBy: ['activity-followers', 'activity-only-you', 'hide-map'],
    stillLeaks: 'Hide entire map is future-only; the past year of maps stays up unless each run is edited.' },
  { id: 'routine-away', section: 'routine', level: 'inferred',
    claim: 'The hours she is predictably away from wherever she starts.',
    evidence: `Each run lasts about ${Math.round(avgPace(activities) * 5 / 60)}–${Math.round(avgPace(activities) * 8 / 60)} minutes and ${ev.scheduled} of ${ev.n_runs} runs fall in the same three weekly slots.`,
    citations: ['strava-privacy'], mitigatedBy: ['activity-followers', 'activity-only-you', 'hide-start-time'],
    stillLeaks: 'Followers still see the timing.' },
  { id: 'routine-gaps', section: 'routine', level: 'unsupported',
    claim: 'Why she stopped running for a while.',
    evidence: `${gapText.charAt(0).toUpperCase() + gapText.slice(1)}. These could be travel, exams, illness or a dead watch battery. The data can’t tell you which.`,
    citations: [], mitigatedBy: ['activity-followers', 'activity-only-you'], stillLeaks: '' },
  // --- identity
  { id: 'id-profile', section: 'identity', level: 'observed',
    claim: 'Her name, college and hometown.',
    evidence: `Shown on her fitness profile: ${profile.display_name} · ${profile.school} · ${profile.hometown}.`,
    citations: ['strava-profile'], mitigatedBy: ['profile-followers'],
    stillLeaks: 'Strava says Followers-only hides “certain profile details” but doesn’t list which; assume her name stays searchable.' },
  { id: 'id-indexed', section: 'identity', level: 'observed',
    claim: 'Her profile can show up in search-engine results.',
    evidence: 'With profile visibility set to Everyone (the default), Strava says the page “may be indexed by search engines.”',
    citations: ['strava-defaults', 'strava-privacy'], mitigatedBy: ['profile-followers'],
    stillLeaks: 'Search results already cached elsewhere can take time to drop out.' },
  { id: 'id-age', section: 'identity', level: 'inferred',
    claim: 'She is probably about 20 or 21.',
    evidence: 'Class of 2027 at a four-year college usually means born around 2005, though people start and finish college at all ages.',
    citations: [], mitigatedBy: [], stillLeaks: 'Her class year appears on the professional profile.' },
  { id: 'id-join', section: 'identity', level: 'inferred',
    claim: 'The runner and the cognitive-science student on the professional site are the same person.',
    evidence: `${proProfile.joinable_with_fitness_profile.length} fields match exactly: name and college.`,
    citations: ['nissenbaum2004', 'sweeney2000', 'ohm2010'], mitigatedBy: ['profile-followers'],
    stillLeaks: 'The professional profile is public on its own, and no Strava setting can change another site.' },
  { id: 'id-school-area', section: 'identity', level: 'inferred',
    claim: 'Her high school hints at the neighborhood her parents live in.',
    evidence: 'Midwood High School is a real public high school in Brooklyn. New York City public high schools often give priority to students who live in the school’s zone, so naming it narrows down where her family likely lives. Some students enter through application programs, so it is a hint, not proof.',
    citations: [], mitigatedBy: [], stillLeaks: 'Not a Strava setting. The professional profile has its own visibility controls.' },
  { id: 'id-career', section: 'identity', level: 'observed',
    claim: 'Her major, high school, internships and skills.',
    evidence: 'Listed on the (fictional) professional profile, which anyone with a free account can view.',
    citations: [], mitigatedBy: [], stillLeaks: 'Not a Strava setting. That profile has its own visibility controls.' },
  { id: 'id-followers', section: 'identity', level: 'observed',
    claim: 'Two of her ten followers are accounts she doesn’t recognize.',
    evidence: 'With profile visibility at Everyone, Strava lets anyone follow without approval.',
    citations: ['strava-profile'], mitigatedBy: ['profile-followers'],
    stillLeaks: 'Switching to Followers requires approval for new followers; existing ones stay until she removes them.' },
  // --- body
  { id: 'body-pace', section: 'body', level: 'observed',
    claim: 'Her pace, distance and how often she runs.',
    evidence: `${ev.n_runs} runs in a year; this run averaged ${ev.hero.pace} /km.`,
    citations: [], mitigatedBy: ['activity-followers', 'activity-only-you'],
    stillLeaks: 'Hidden Details can hide pace on individual runs, but not in bulk for past runs.' },
  { id: 'body-trend', section: 'body', level: 'inferred',
    claim: 'She has been getting fitter over the year.',
    evidence: `Average pace went from ${ev.pace_first} /km in her first three months to ${ev.pace_last} /km in her last three.`,
    citations: [], mitigatedBy: ['activity-followers', 'activity-only-you'], stillLeaks: 'Followers still see the trend.' },
  { id: 'body-hr', section: 'body', level: 'observed',
    claim: 'Her heart rate, and when and where she is working hardest.',
    evidence: `Average ${ev.hero.avg_hr} bpm, peak ${ev.hero.max_hr} bpm about ${ev.hero.max_hr_km} km in, ${ev.hero.peak_near_stairs_m < 250 ? 'near the Morningside Park stairs' : 'on the steepest climb'}.`,
    citations: ['postma2018', 'strava-hidden'], mitigatedBy: ['hide-hr', 'activity-followers', 'activity-only-you'],
    stillLeaks: 'Hiding heart rate applies to new uploads; past runs need a separate step. Strava notes hidden details “may still be visible … elsewhere in the product.”' },
  { id: 'body-health', section: 'body', level: 'unsupported',
    claim: 'Anything about a medical condition.',
    evidence: 'Heart rate and pace shift with hills, heat, sleep, caffeine and the sensor itself. Nothing here establishes a diagnosis.',
    citations: ['ftc2022', 'grundy2019'], mitigatedBy: ['hide-hr', 'activity-only-you'], stillLeaks: '' },
  // --- crowd
  { id: 'crowd-heatmap', section: 'crowd', level: 'observed',
    claim: 'Her runs feed the public Global Heatmap by default.',
    evidence: `All ${ev.n_runs} runs are set to Everyone, so the parts outside her hidden zones count toward the heatmap.`,
    citations: ['strava-heatmap', 'strava-activity'], mitigatedBy: ['heatmap-opt-out', 'activity-followers', 'activity-only-you'],
    stillLeaks: 'Opting out of the heatmap doesn’t change who can see her individual activities.' },
  { id: 'crowd-pickout', section: 'crowd', level: 'unsupported',
    claim: 'Picking her individual route out of the neighborhood heatmap.',
    evidence: `In our simulation, ${ev.heatmap_cover_pct}% of her weekday route lies within 15 m of at least five other runners’ tracks.`,
    citations: ['childs2023'], mitigatedBy: ['heatmap-opt-out'], stillLeaks: '' },
];
write('claims.json', { generated_by: 'scripts/generate-data.mjs', evidence: ev, claims });

// ---------------------------------------------------------------------------
// References (from docs/report.md; Strava support entries re-checked 2026-11-16)
// ---------------------------------------------------------------------------
const references = [
  { key: 'bbc2018', apa: 'BBC News. (2018, January 29). Fitness app Strava lights up staff at military bases.', url: 'https://www.bbc.com/news/technology-42853072' },
  { key: 'bogle2018', apa: 'Bogle, A. (2018, January 29). Strava has published details about secret military bases, and an Australian was the first to know. ABC News.', url: null },
  { key: 'boyd2012', apa: 'Boyd, d., & Crawford, K. (2012). Critical questions for big data. Information, Communication & Society, 15(5), 662–679.', url: 'https://doi.org/10.1080/1369118X.2012.678878' },
  { key: 'childs2023', apa: 'Childs, K., Nolting, D., & Das, A. (2023). Heat marks the spot: De-anonymizing user’s geographical data on the Strava heatmap. 7th Workshop on Technology and Consumer Protection (ConPro ’23).', url: 'https://privacy-datahub.csc.ncsu.edu/publication/childs-conpro-2023' },
  { key: 'faverio2023', apa: 'Faverio, M. (2023, October 18). Key findings about Americans and data privacy. Pew Research Center.', url: 'https://www.pewresearch.org/short-reads/2023/10/18/key-findings-about-americans-and-data-privacy/' },
  { key: 'ftc2022', apa: 'Federal Trade Commission. (2022, January). Complying with FTC’s Health Breach Notification Rule.', url: 'https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0' },
  { key: 'franzke2020', apa: 'Franzke, A. S., Bechmann, A., Zimmer, M., Ess, C., & the Association of Internet Researchers. (2020). Internet research: Ethical guidelines 3.0. Association of Internet Researchers.', url: 'https://aoir.org/reports/ethics3.pdf' },
  { key: 'grundy2019', apa: 'Grundy, Q., Chiu, K., Held, F., Continella, A., Bero, L., & Holz, R. (2019). Data sharing practices of medicines related apps and the mobile ecosystem: Traffic, content, and network analysis. BMJ, 364, l920.', url: 'https://doi.org/10.1136/bmj.l920' },
  { key: 'hern2018', apa: 'Hern, A. (2018, January 28). Fitness tracking app Strava gives away location of secret US army bases. The Guardian.', url: 'https://www.theguardian.com/world/2018/jan/28/fitness-tracking-app-gives-away-location-of-secret-us-army-bases' },
  { key: 'mcclain2023', apa: 'McClain, C., Faverio, M., Anderson, M., & Park, E. (2023, October 18). How Americans view data privacy. Pew Research Center.', url: 'https://www.pewresearch.org/internet/2023/10/18/how-americans-view-data-privacy/' },
  { key: 'meteriz2024', apa: 'Meteriz-Yildiran, Ü., Yildiran, N. F., Kim, J., & Mohaisen, D. (2024). Learning location from shared elevation profiles in fitness apps: A privacy perspective. IEEE Transactions on Mobile Computing, 23(1), 581–596.', url: 'https://doi.org/10.1109/TMC.2022.3218148' },
  { key: 'na2018', apa: 'Na, L., Yang, C., Lo, C.-C., Zhao, F., Fukuoka, Y., & Aswani, A. (2018). Feasibility of reidentifying individuals in large national physical activity data sets from which protected health information has been removed with use of machine learning. JAMA Network Open, 1(8), e186040.', url: 'https://doi.org/10.1001/jamanetworkopen.2018.6040' },
  { key: 'nissenbaum2004', apa: 'Nissenbaum, H. (2004). Privacy as contextual integrity. Washington Law Review, 79(1), 119–158.', url: null },
  { key: 'ohm2010', apa: 'Ohm, P. (2010). Broken promises of privacy: Responding to the surprising failure of anonymization. UCLA Law Review, 57(6), 1701–1777.', url: null },
  { key: 'pal2024', apa: 'Pal, A. (2024, November 20). Strava users can no longer publicly share activity data on third-party apps, as company aims to crack down on fitness syncing ecosystem. road.cc.', url: 'https://road.cc/?p=67757' },
  { key: 'postma2018', apa: 'Postma, F. (2018, July 8). After Strava, Polar is revealing the homes of soldiers and spies. Bellingcat.', url: 'https://www.bellingcat.com/resources/articles/2018/07/08/strava-polar-revealing-homes-soldiers-spies/' },
  { key: 'robb2017', apa: 'Robb, D. (2017, November 1). Building the global heatmap. Strava Engineering.', url: 'https://medium.com/strava-engineering/the-global-heatmap-now-6x-hotter-23fc01d301de' },
  { key: 'solove2013', apa: 'Solove, D. J. (2013). Introduction: Privacy self-management and the consent dilemma. Harvard Law Review, 126(7), 1880–1903.', url: null },
  { key: 'strava-map', apa: 'Strava. (n.d.-a). How do I edit my map visibility on Strava? Strava Support.', url: 'https://support.strava.com/hc/en-us/articles/115000173384-Map-Visibility' },
  { key: 'strava-privacy', apa: 'Strava. (n.d.-b). Privacy controls. Strava Support.', url: 'https://support.strava.com/en-us/articles/15401951-privacy-controls' },
  { key: 'strava-policy', apa: 'Strava. (n.d.-c). Privacy policy.', url: 'https://www.strava.com/legal/privacy' },
  { key: 'strava-defaults', apa: 'Strava. (n.d.-d). What are my privacy defaults when I create a Strava account? Strava Support.', url: 'https://support.strava.com/en-us/articles/15401763-what-are-my-privacy-defaults-when-i-create-a-strava-account', added: true },
  { key: 'strava-profile', apa: 'Strava. (n.d.-e). What are Strava’s profile page privacy controls? Strava Support.', url: 'https://support.strava.com/en-us/articles/15401967-profile-page-privacy-controls', added: true },
  { key: 'strava-activity', apa: 'Strava. (n.d.-f). How do my activity privacy controls work on Strava? Strava Support.', url: 'https://support.strava.com/en-us/articles/15401987-activity-privacy-controls', added: true },
  { key: 'strava-heatmap', apa: 'Strava. (n.d.-g). What are the Global Heatmap and Strava Metro? Strava Support.', url: 'https://support.strava.com/en-us/articles/15401880-the-global-heatmap-and-strava-metro', added: true },
  { key: 'strava-hidden', apa: 'Strava. (n.d.-h). How do I hide details from my activities on Strava? Strava Support.', url: 'https://support.strava.com/en-us/articles/15401769-how-do-i-hide-details-from-my-activities-on-strava', added: true },
  { key: 'strava-interval', apa: 'Strava. (n.d.-i). Segment matching issues. Strava Support.', url: 'https://support.strava.com/hc/en-us/articles/216918187-Segment-Matching-Issues', added: true },
  { key: 'sweeney2000', apa: 'Sweeney, L. (2000). Simple demographics often identify people uniquely (Data Privacy Working Paper 3). Carnegie Mellon University.', url: null },
  { key: 'tryterra2026', apa: 'TryTerra. (2026). Strava API changes in 2026: Can developers still get access?', url: 'https://tryterra.co/blog/strava-api-changes-2026' },
];
write('references.json', references);
console.log('Done.');
