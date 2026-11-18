import './styles.css';
import scrollama from 'scrollama';
import { createMap } from './map.js';
import { createCover } from './cover.js';
import { renderBadges, renderClaims, renderSettings, renderReferences, fillEvidence, activityCard } from './content.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const load = (f) => fetch(`${import.meta.env.BASE_URL}data/${f}`).then((r) => {
  if (!r.ok) throw new Error(`${f}: ${r.status}`);
  return r.json();
});

const [claimsDoc, refs, profile, actsDoc, hero, routes, settings, professional, followers] = await Promise.all([
  load('claims.json'), load('references.json'), load('profile.json'), load('activities.json'),
  load('hero-run.json'), load('routes.geojson'), load('settings-defaults.json'),
  load('pro-profile.json'), load('followers.json'),
]);
const heroAct = actsDoc.activities.find((a) => a.id === hero.activity_id);

createCover(document.getElementById('cover'), hero, { reduceMotion });

// ---- text-side content ----
activityCard(document.getElementById('hero-card'), { profile, act: heroAct, routeFeature: routes.features.find((f) => f.properties.id === 'A') });
renderClaims(claimsDoc.claims, refs);
renderSettings(settings, refs);
renderBadges();
fillEvidence({
  ...claimsDoc.evidence, profile, professional,
  professionalExperience: professional.experience.map(({ title, org }) => `${title} at ${org}`).join('\n'),
  professionalSkills: professional.skills.join(', '),
  followers: { total: followers.length, unrecognized: followers.filter((f) => !f.recognized).length },
});
renderReferences(refs, document.getElementById('ref-list'));
// wrap each step's content so it can hold in the middle of the screen while the step scrolls by
document.querySelectorAll('.step').forEach((step) => {
  const inner = document.createElement('div');
  inner.className = 'step-inner';
  inner.append(...step.childNodes);
  step.append(inner);
});

// ---- map ----
const mapApi = createMap({ container: document.getElementById('map'), hero, routes, activities: actsDoc.activities, reduceMotion });
const readout = document.getElementById('readout');
const roDist = document.getElementById('ro-dist'), roTime = document.getElementById('ro-time'), roHr = document.getElementById('ro-hr');
const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const onSample = (s) => {
  roDist.textContent = `${(s.d / 1000).toFixed(2)} km`;
  roTime.textContent = fmtClock(s.time);
  roHr.textContent = `${s.hr} bpm`;
};

// ---- map legend per scene ----
const legend = document.getElementById('map-legend');
const sw = (style) => `<span class="sw" style="${style}"></span>`;
const LEGENDS = {
  'home-first': [[sw('border-radius:50%;background:#c2417a;border:2px solid #c2417a'), 'Start of her first run'], [sw('border-radius:50%;background:#fff;border:2px solid #c2417a'), 'End of her first run']],
  'home-year': [[sw('border-radius:50%;background:#c2417a'), 'Where a run started'], [sw('border-radius:50%;background:#fff;border:1.5px solid #c2417a'), 'Where a run ended']],
  'home-hidden': [[sw('border-radius:50%;background:#8a877f33;border:1.5px dashed #8a877f'), '200 m hidden by default'], [sw('border-radius:50%;background:#55524b'), 'Where a visible track begins or ends']],
  'home-address': [[sw('border-radius:50%;background:#8a877f33;border:1.5px dashed #8a877f'), 'Hidden near an address (400 m, illustrative)'], [sw('border-radius:50%;background:#55524b'), 'Where a visible track begins or ends']],
  'home-elevation': [[sw('border-radius:50%;background:#fff;border:2px solid #1b1a17'), 'Lowest and highest points']],
};
function showLegend(scene) {
  const rows = LEGENDS[scene];
  legend.hidden = !rows;
  if (rows) legend.innerHTML = rows.map(([s, t]) => `<div class="row">${s}<span>${t}</span></div>`).join('');
}

// ---- lazy charts ----
let routine = null;
async function getRoutine() {
  if (!routine) {
    const { createRoutine } = await import('./charts/routine.js');
    routine = createRoutine({
      heatEl: document.getElementById('routine-heat'), calEl: document.getElementById('routine-cal'),
      titleEl: document.getElementById('routine-title'), data: actsDoc,
      srHeat: document.getElementById('sr-routine-heat'), srGaps: document.getElementById('sr-routine-gaps'),
    });
  }
  return routine;
}
const eleEl = document.getElementById('elevation-chart');
new IntersectionObserver(async (entries, obs) => {
  if (!entries.some((e) => e.isIntersecting)) return;
  obs.disconnect();
  const { createElevation } = await import('./charts/elevation.js');
  createElevation(eleEl, hero);
}, { rootMargin: '200% 0px' }).observe(eleEl);
// warm up the routine chart before the reader reaches it
new IntersectionObserver((entries, obs) => {
  if (entries.some((e) => e.isIntersecting)) { obs.disconnect(); getRoutine(); }
}, { rootMargin: '150% 0px' }).observe(document.getElementById('routine'));

// ---- scenes ----
const layers = Object.fromEntries(['map', 'routine', 'identity']
  .map((name) => [name, document.getElementById(`layer-${name}`)]));
function showLayer(name) {
  for (const [k, el] of Object.entries(layers)) el.classList.toggle('is-active', k === name);
}
// Part 4, scroll-linked in four beats, each with a pause:
//   two separate profiles -> slide together (--m) -> part, shrink and move up (--s)
//   while the combined "pattern of life" table rises below (--t) -> rows fill in
const idVisual = document.getElementById('identity-visual');
const polRows = [...idVisual.querySelectorAll('.pol tr')];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => x * x * (3 - 2 * x);
const span = (p, a, b) => smooth(clamp01((p - a) / (b - a)));
function setIdentity(progress, mode) {
  const p = mode === 'followers' ? 1 : progress;
  const m = span(p, 0.14, 0.34);           // 0–0.14: hold apart
  const s = span(p, 0.52, 0.68);           // 0.34–0.52: hold overlapped
  const t = span(p, 0.6, 0.72);
  const rows = clamp01((p - 0.7) / 0.2);  // rows fill 0.7–0.9, then hold
  idVisual.style.setProperty('--m', m.toFixed(3));
  idVisual.style.setProperty('--s', s.toFixed(3));
  idVisual.style.setProperty('--t', t.toFixed(3));
  idVisual.classList.toggle('is-merged', m > 0.97 && s < 0.05);
  idVisual.classList.toggle('has-table', t > 0);
  idVisual.classList.toggle('is-followers', mode === 'followers');
  polRows.forEach((r, i) => r.classList.toggle('is-on', rows >= (i + 1) / (polRows.length + 1) || rows === 1));
}
async function enterScene(step, direction) {
  const scene = step.dataset.scene;
  if (!scene) return;
  if (scene.startsWith('identity')) {
    showLayer('identity');
    readout.hidden = true;
    if (scene === 'identity-followers') setIdentity(1, 'followers');
    // reduced motion: no scroll-linked progress, so show the overlap straight away
    else setIdentity(reduceMotion || direction === 'up' ? 1 : 0, 'match');
    return;
  }
  if (scene.startsWith('routine-')) {
    showLayer('routine');
    readout.hidden = true;
    (await getRoutine()).setState(scene.replace('routine-', ''));
    return;
  }
  showLayer('map');
  showLegend(scene);
  readout.hidden = scene !== 'run';
  if (scene === 'run') {
    const from = +step.dataset.runFrom, to = +step.dataset.runTo;
    // reduced motion: a static state per step (the route up to the end of that step)
    const frac = reduceMotion ? to : direction === 'up' ? to : from;
    mapApi.setScene('run', { frac, onSample });
  } else {
    mapApi.setScene(scene);
  }
}

const isMobile = () => window.matchMedia('(max-width: 860px)').matches;
const stage = document.querySelector('.stage');
const scroller = scrollama();
scroller.setup({ step: '.step[data-scene], .section-head', offset: isMobile() ? 0.8 : 0.5, progress: !reduceMotion })
  .onStepEnter(({ element, direction }) => {
    document.querySelectorAll('.step.is-active, .section-head.is-active').forEach((s) => s.classList.remove('is-active'));
    element.classList.add('is-active');
    // chapter titles: veil the visual so the "Part" heading reads as a break
    const isChapter = element.classList.contains('section-head');
    stage.classList.toggle('is-chapter', isChapter);
    if (isChapter) {
      // scrolling down into a chapter: get the next scene ready underneath the veil
      const next = direction === 'down' ? element.parentElement.querySelector(`#${element.id} ~ .step[data-scene]`) : null;
      if (next) enterScene(next, 'down');
      return;
    }
    enterScene(element, direction);
  })
  .onStepProgress(({ element, progress }) => {
    if (element.dataset.scene === 'identity-match') {
      setIdentity(progress, 'match');
      return;
    }
    if (element.dataset.scene !== 'run') return;
    const from = +element.dataset.runFrom, to = +element.dataset.runTo;
    mapApi.setProgress(from + (to - from) * progress, onSample);
  });
window.addEventListener('resize', () => scroller.resize());

// initial state: the run, at its start
mapApi.setScene('run', { frac: reduceMotion ? 1 : 0, onSample });
