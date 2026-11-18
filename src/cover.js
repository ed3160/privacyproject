// Cover: Millie's run draws itself on load, with the clock time stamped at each landmark.
// Uses the same hero-run data as the map, so every time and distance shown is real (simulated) data.

const NS = 'http://www.w3.org/2000/svg';
const LOCK = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

// landmarks along the loop, as a fraction of distance (matches the story's step boundaries)
const STOPS = [
  { f: 0, label: 'Leaves Broadway' },
  { f: 0.28, label: 'Riverside Park' },
  { f: 0.5, label: 'Amsterdam Ave' },
  { f: 0.75, label: 'Morningside Park' },
  { f: 1, label: 'Back on Broadway' },
];

export function createCover(el, hero, { reduceMotion }) {
  const n = hero.lon.length;
  const total = hero.dist_m[n - 1];
  const t0 = new Date(hero.start);
  const clock = (s) => new Date(t0.getTime() + s * 1000)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

  // project lon/lat to a square-ish viewBox
  const k = Math.cos((hero.lat[0] * Math.PI) / 180);
  const xs = hero.lon.map((x) => x * k), ys = hero.lat.map((y) => -y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const W = 600, H = 600, pad = 44;
  const s = Math.min((W - 2 * pad) / (x1 - x0), (H - 2 * pad) / (y1 - y0));
  const ox = (W - s * (x1 - x0)) / 2, oy = (H - s * (y1 - y0)) / 2;
  const P = xs.map((x, i) => [ox + (x - x0) * s, oy + (ys[i] - y0) * s]);
  const d = 'M' + P.map((p) => p.map((v) => v.toFixed(1)).join(',')).join('L');
  const idxAt = (f) => { const target = f * total; let i = 0; while (i < n - 1 && hero.dist_m[i] < target) i++; return i; };

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="cover-svg" role="img" aria-label="Millie's route: a loop from Broadway through Riverside Park, West 122nd Street and Morningside Park, back to Broadway, about 4.8 km in 28 minutes.">
      <defs>
        <pattern id="cover-grid" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(29)">
          <path d="M28 0H0V28" fill="none" stroke="currentColor" stroke-width="1"/>
        </pattern>
      </defs>
      <rect class="cover-grid" width="${W}" height="${H}" fill="url(#cover-grid)"/>
      <path class="cover-ghost" d="${d}"/>
      <path class="cover-line" d="${d}"/>
      <g class="cover-stops"></g>
      <circle class="cover-dot-halo" r="14"/>
      <circle class="cover-dot" r="6"/>
    </svg>
    <div class="cover-foot">
    <div class="cover-readout" aria-hidden="true">
      <span><b class="cr-clock">${clock(0)}</b></span>
      <span><b class="cr-dist">0.00</b> km</span>
      <span><b class="cr-hr">${hero.hr_bpm[0]}</b> bpm</span>
    </div>
    <div class="cover-public" aria-hidden="true">${LOCK}<span>Visible to: Everyone</span></div>
    </div>`;

  const svg = el.querySelector('svg');
  const line = svg.querySelector('.cover-line');
  const dot = svg.querySelector('.cover-dot'), halo = svg.querySelector('.cover-dot-halo');
  const stopsG = svg.querySelector('.cover-stops');
  const L = line.getTotalLength();
  line.style.strokeDasharray = `${L} ${L}`;

  // landmark labels: timestamp + place, pushed outward from the route's middle
  const cx = W / 2;
  const stops = STOPS.filter((st) => st.f < 1).map((st) => {
    const i = idxAt(st.f);
    const [x, y] = P[i];
    const right = x >= cx;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'cover-stop');
    g.innerHTML = `<circle cx="${x}" cy="${y}" r="3.5"/>
      <text x="${x + (right ? 12 : -12)}" y="${y - 4}" text-anchor="${right ? 'start' : 'end'}"><tspan class="cs-time">${clock(hero.time_s[i])}</tspan><tspan x="${x + (right ? 12 : -12)}" dy="15">${st.label}</tspan></text>`;
    stopsG.append(g);
    return { f: st.f, g };
  });

  const ro = { clock: el.querySelector('.cr-clock'), dist: el.querySelector('.cr-dist'), hr: el.querySelector('.cr-hr') };
  const pub = el.querySelector('.cover-public');
  function draw(f) {
    const i = idxAt(f);
    line.style.strokeDashoffset = String(L * (1 - f));
    const [x, y] = P[i];
    dot.setAttribute('cx', x); dot.setAttribute('cy', y);
    halo.setAttribute('cx', x); halo.setAttribute('cy', y);
    ro.clock.textContent = clock(hero.time_s[i]);
    ro.dist.textContent = (hero.dist_m[i] / 1000).toFixed(2);
    ro.hr.textContent = hero.hr_bpm[i];
    for (const st of stops) st.g.classList.toggle('is-on', f >= st.f);
    pub.classList.toggle('is-on', f >= 1);
  }

  if (reduceMotion) { draw(1); return; }
  draw(0);
  const DUR = 6500, DELAY = 500;
  let start = null;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2) * 0.15 + t * 0.85; // gentle in/out, mostly steady
  function frame(ts) {
    if (start === null) start = ts + DELAY;
    const t = Math.min(1, Math.max(0, (ts - start) / DUR));
    draw(ease(t));
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
