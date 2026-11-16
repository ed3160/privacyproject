import * as maplibregl from 'maplibre-gl';
// MapLibre v6 loads its worker from a runtime URL that bundlers can't see; bundle it explicitly.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
maplibregl.setWorkerUrl(workerUrl);
import { lineString, point, featureCollection, circle, lineSliceAlong, length as turfLength, bbox as turfBbox, distance } from '@turf/turf';

const STYLE = 'https://tiles.openfreemap.org/styles/positron';
const HIDE_LAYERS = /shield|airport|label_village|label_town|label_state|label_city|label_country|highway-name-path|railway/;
const C = { millie: '#c2417a', millieSoft: '#e7a9c4', ink: '#1b1a17', ink2: '#55524b', zone: '#8a877f' };
const ADDRESS_RADIUS_M = 400; // illustrative; see DATA.md

const empty = featureCollection([]);

export function createMap({ container, hero, routes, activities, reduceMotion }) {
  const coords = hero.lon.map((x, i) => [x, hero.lat[i]]);
  const heroLine = lineString(coords);
  const totalM = hero.dist_m[hero.dist_m.length - 1];
  const routeFeat = Object.fromEntries(routes.features.map((f) => [f.properties.id, f]));
  // the block where every route begins (median of recorded starts)
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
  const center = [med(activities.map((a) => a.start_point[0])), med(activities.map((a) => a.start_point[1]))];
  const first = activities.find((a) => a.tags.includes('first-upload-unhidden'));

  const map = new maplibregl.Map({
    container, style: STYLE, interactive: false, attributionControl: false,
    bounds: turfBbox(heroLine), fitBoundsOptions: { padding: 40 },
    fadeDuration: reduceMotion ? 0 : 300,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-right');

  // --- derived geometry ---
  const yearEnds = featureCollection(activities.flatMap((a) => [
    point(a.start_point, { kind: 'start' }), point(a.end_point, { kind: 'end' })]));
  const visStarts = featureCollection(activities.filter((a) => a !== first).flatMap((a) => [
    point(a.visible_start_200m), point(a.visible_end_200m)]));
  const visTracks = featureCollection(Object.values(routeFeat).map((f) => {
    const L = turfLength(f, { units: 'meters' });
    return lineSliceAlong(f, 200, L - 200, { units: 'meters' });
  }));
  const zone200 = circle(center, 200, { units: 'meters', steps: 96 });
  const zoneAddr = circle(center, ADDRESS_RADIUS_M, { units: 'meters', steps: 128 });
  // address zone: keep only the parts of each route outside the circle
  const outside = (f) => {
    const parts = [];
    let cur = [];
    for (const p of f.geometry.coordinates) {
      if (distance(center, p, { units: 'meters' }) > ADDRESS_RADIUS_M) cur.push(p);
      else if (cur.length) { parts.push(cur); cur = []; }
    }
    if (cur.length) parts.push(cur);
    return parts.filter((p) => p.length > 1).map((p) => lineString(p));
  };
  const addrTracks = featureCollection(Object.values(routeFeat).flatMap(outside));
  const addrEdges = featureCollection(addrTracks.features.flatMap((l) => {
    const c = l.geometry.coordinates;
    return [c[0], c[c.length - 1]].filter((p) => distance(center, p, { units: 'meters' }) < ADDRESS_RADIUS_M + 30).map((p) => point(p));
  }));
  const eleMin = hero.ele_m.indexOf(Math.min(...hero.ele_m));
  const eleMax = hero.ele_m.indexOf(Math.max(...hero.ele_m));
  const eleMarks = featureCollection([
    point(coords[eleMin], { label: `${Math.round(hero.ele_m[eleMin])} m` }),
    point(coords[eleMax], { label: `${Math.round(hero.ele_m[eleMax])} m` })]);

  let ready = false;
  let pending = null;

  map.on('load', () => {
    for (const l of map.getStyle().layers) {
      if (HIDE_LAYERS.test(l.id)) map.setLayoutProperty(l.id, 'visibility', 'none');
      if (l.type === 'symbol' && /highway-name/.test(l.id)) map.setPaintProperty(l.id, 'text-color', '#8d8a82');
    }
    const add = (id, data) => map.addSource(id, { type: 'geojson', data });
    add('hero', heroLine);
    add('run-done', empty);
    add('dot', empty);
    add('first-ends', featureCollection([point(first.start_point, { kind: 'start' }), point(first.end_point, { kind: 'end' })]));
    add('year-ends', yearEnds);
    add('zone200', zone200);
    add('vis-tracks', visTracks);
    add('vis-starts', visStarts);
    add('zone-addr', zoneAddr);
    add('addr-tracks', addrTracks);
    add('addr-edges', addrEdges);
    add('ele-marks', eleMarks);

    const L = (spec) => map.addLayer({ ...spec, layout: { visibility: 'none', ...(spec.layout || {}) } });
    L({ id: 'zone200-fill', type: 'fill', source: 'zone200', paint: { 'fill-color': C.zone, 'fill-opacity': 0.12 } });
    L({ id: 'zone200-line', type: 'line', source: 'zone200', paint: { 'line-color': C.zone, 'line-width': 1.5, 'line-dasharray': [2, 2] } });
    L({ id: 'zone-addr-fill', type: 'fill', source: 'zone-addr', paint: { 'fill-color': C.zone, 'fill-opacity': 0.12 } });
    L({ id: 'zone-addr-line', type: 'line', source: 'zone-addr', paint: { 'line-color': C.zone, 'line-width': 1.5, 'line-dasharray': [2, 2] } });
    L({ id: 'hero-ghost', type: 'line', source: 'hero', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': C.millieSoft, 'line-width': 3 } });
    L({ id: 'hero-full', type: 'line', source: 'hero', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': C.millie, 'line-width': 3.5 } });
    L({ id: 'run-done', type: 'line', source: 'run-done', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': C.millie, 'line-width': 4 } });
    L({ id: 'vis-tracks', type: 'line', source: 'vis-tracks', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': C.millie, 'line-width': 3, 'line-opacity': 0.85 } });
    L({ id: 'addr-tracks', type: 'line', source: 'addr-tracks', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': C.millie, 'line-width': 3, 'line-opacity': 0.85 } });
    L({ id: 'year-ends', type: 'circle', source: 'year-ends', paint: { 'circle-radius': 4, 'circle-color': ['match', ['get', 'kind'], 'start', C.millie, '#ffffff'], 'circle-stroke-color': C.millie, 'circle-stroke-width': 1.5, 'circle-opacity': 0.75 } });
    L({ id: 'vis-starts', type: 'circle', source: 'vis-starts', paint: { 'circle-radius': 3.5, 'circle-color': C.ink2, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1, 'circle-opacity': 0.85 } });
    L({ id: 'addr-edges', type: 'circle', source: 'addr-edges', paint: { 'circle-radius': 5, 'circle-color': C.ink2, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
    L({ id: 'first-ends', type: 'circle', source: 'first-ends', paint: { 'circle-radius': 8, 'circle-color': ['match', ['get', 'kind'], 'start', C.millie, '#ffffff'], 'circle-stroke-color': C.millie, 'circle-stroke-width': 2.5 } });
    L({ id: 'ele-marks', type: 'circle', source: 'ele-marks', paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-color': C.ink, 'circle-stroke-width': 2 } });
    L({ id: 'dot', type: 'circle', source: 'dot', paint: { 'circle-radius': 7, 'circle-color': C.millie, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
    ready = true;
    if (pending) { const p = pending; pending = null; setScene(p.name, p.opts); }
  });

  // --- progress along the hero run ---
  function sampleAt(frac) {
    const d = Math.max(0, Math.min(1, frac)) * totalM;
    let lo = 0, hi = hero.dist_m.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (hero.dist_m[mid] <= d) lo = mid; else hi = mid; }
    const span = hero.dist_m[hi] - hero.dist_m[lo] || 1;
    const t = Math.max(0, Math.min(1, (d - hero.dist_m[lo]) / span));
    const lerp = (a, b) => a + (b - a) * t;
    return { i: lo, pt: [lerp(coords[lo][0], coords[hi][0]), lerp(coords[lo][1], coords[hi][1])],
      d, time: lerp(hero.time_s[lo], hero.time_s[hi]), hr: Math.round(lerp(hero.hr_bpm[lo], hero.hr_bpm[hi])) };
  }
  let lastFrac = -1;
  function setProgress(frac, onSample) {
    const s = sampleAt(frac);
    onSample?.(s);
    if (!ready || Math.abs(frac - lastFrac) < 0.0005) return;
    lastFrac = frac;
    const done = coords.slice(0, s.i + 1).concat([s.pt]);
    map.getSource('run-done').setData(done.length > 1 ? lineString(done) : empty);
    map.getSource('dot').setData(point(s.pt));
  }

  // --- scenes ---
  const SCENES = {
    run: { layers: ['hero-ghost', 'run-done', 'dot'], view: { bounds: turfBbox(heroLine), padding: 48 } },
    'home-first': { layers: ['hero-ghost', 'first-ends'], view: { center, zoom: 16.6 } },
    'home-year': { layers: ['year-ends'], view: { center, zoom: 17.2 } },
    'home-hidden': { layers: ['zone200-fill', 'zone200-line', 'vis-tracks', 'vis-starts'], view: { center, zoom: 15.6 } },
    'home-address': { layers: ['zone-addr-fill', 'zone-addr-line', 'addr-tracks', 'addr-edges'], view: { center, zoom: 14.9 } },
    'home-elevation': { layers: ['hero-full', 'ele-marks'], view: { bounds: turfBbox(heroLine), padding: 48 } },
  };
  const ALL = [...new Set(Object.values(SCENES).flatMap((s) => s.layers))];
  let current = null;

  function setScene(name, opts = {}) {
    if (!ready) { pending = { name, opts }; return; }
    const sc = SCENES[name];
    if (!sc) return;
    for (const id of ALL) map.setLayoutProperty(id, 'visibility', sc.layers.includes(id) ? 'visible' : 'none');
    if (name === current) return;
    current = name;
    const dur = reduceMotion ? 0 : 1600;
    if (sc.view.bounds) {
      const cam = map.cameraForBounds(sc.view.bounds, { padding: sc.view.padding });
      reduceMotion ? map.jumpTo(cam) : map.flyTo({ ...cam, duration: dur, essential: false });
    } else {
      reduceMotion ? map.jumpTo(sc.view) : map.flyTo({ ...sc.view, duration: dur, essential: false });
    }
    if (name === 'run' && opts.frac != null) { lastFrac = -1; setProgress(opts.frac, opts.onSample); }
  }

  const ro = new ResizeObserver(() => map.resize());
  ro.observe(container);

  return { map, setScene, setProgress, sampleAt, totalM, center };
}
