// Network-backed sources with an on-disk cache in data-cache/.
// The generator is deterministic given the cache: if a cache file exists it is
// used verbatim; the network is only touched when a cache file is missing or
// when --refresh is passed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CACHE_DIR = path.resolve('data-cache');
const REFRESH = process.argv.includes('--refresh');
const UA = 'following-millie-class-project/0.1 (educational, cached, low-volume)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

async function cached(kind, keyObj, fetcher) {
  const dir = path.join(CACHE_DIR, kind);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, hash(JSON.stringify(keyObj)) + '.json');
  if (!REFRESH && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')).data;
  const data = await fetcher();
  fs.writeFileSync(file, JSON.stringify({ key: keyObj, fetched: new Date().toISOString().slice(0, 10), data }));
  return data;
}

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) { await sleep(1500 * (i + 1)); continue; }
      throw new Error(`${res.status} ${url}`);
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

// Foot routing over OpenStreetMap via the FOSSGIS OSRM instance (keyless).
// waypoints: [[lon,lat],...]  -> [[lon,lat],...] following OSM ways.
export async function footRoute(waypoints) {
  const r5 = waypoints.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]);
  return cached('osrm-foot', r5, async () => {
    await sleep(1100);
    const coords = r5.map((p) => p.join(',')).join(';');
    const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson&continue_straight=false`;
    const j = await getJSON(url);
    if (j.code !== 'Ok') throw new Error('OSRM ' + j.code);
    return { coordinates: j.routes[0].geometry.coordinates, distance: j.routes[0].distance };
  });
}

// USGS NED 10 m elevation via OpenTopoData (keyless; 100 locations/request, 1 req/s).
export async function elevations(points) {
  const r5 = points.map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
  return cached('elevation-ned10m', r5, async () => {
    const out = [];
    for (let i = 0; i < r5.length; i += 100) {
      await sleep(1200);
      const locs = r5.slice(i, i + 100).map(([x, y]) => `${y},${x}`).join('|');
      const j = await getJSON(`https://api.opentopodata.org/v1/ned10m?locations=${locs}`);
      if (j.status !== 'OK') throw new Error('opentopodata ' + j.status);
      for (const r of j.results) out.push(r.elevation);
    }
    return out;
  });
}
