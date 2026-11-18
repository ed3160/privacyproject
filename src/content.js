// Renders text-side components from the generated data files.
// Every number shown comes from claims.json (computed by the generator) or a cited source.

const ICONS = {
  // observed: filled circle; inferred: half-filled; unsupported: dashed ring with ?
  observed: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="currentColor"/></svg>',
  inferred: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6 1.4a4.6 4.6 0 0 1 0 9.2z" fill="currentColor"/></svg>',
  unsupported: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.6"/><text x="6" y="8.6" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" font-family="Inter Variable, system-ui, sans-serif">?</text></svg>',
  lock: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
};
const LABEL = { observed: 'Observed', inferred: 'Inferred', unsupported: 'Unsupported' };
export const badgeHTML = (level) => `${ICONS[level]}<span>${LABEL[level]}</span>`;

export function renderBadges(root = document) {
  root.querySelectorAll('.badge[data-level]').forEach((el) => { el.innerHTML = badgeHTML(el.dataset.level); });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function citeLinks(keys, refs) {
  if (!keys?.length) return '';
  const byKey = Object.fromEntries(refs.map((r) => [r.key, r]));
  return ' ' + keys.filter((k) => byKey[k]).map((k) => `<a class="cite" href="#ref-${k}">${esc(shortCite(byKey[k]))}</a>`).join(' ');
}
export function shortCite(ref) {
  const m = ref.apa.match(/^(.+?)\.\s\((\d{4}|n\.d\.[^)]*)/);
  if (!m) return ref.key;
  let who = m[1];
  if (who.startsWith('Strava')) return `(Strava, ${m[2]})`;
  const names = who.split(/,\s(?:&\s)?|\s&\s/).filter((x) => !/^[A-Z]\.(\s?[A-Z]\.)*$/.test(x.trim()));
  const fam = names[0].split(',')[0].trim();
  const count = (who.match(/&/g) || []).length + (who.match(/\.,\s[A-Z]/g) || []).length;
  return `(${fam}${count > 1 ? ' et al.' : count === 1 && names[1] ? ' & ' + names[1].split(',')[0].trim() : ''}, ${m[2]})`;
}

export function renderClaims(claims, refs, root = document) {
  const byId = Object.fromEntries(claims.map((c) => [c.id, c]));
  root.querySelectorAll('.claim-slot[data-claim]').forEach((slot) => {
    const c = byId[slot.dataset.claim];
    if (!c) return;
    slot.outerHTML = `<div class="claim" data-level="${c.level}" data-claim-id="${c.id}">
      <span class="badge" data-level="${c.level}">${badgeHTML(c.level)}</span>
      <p class="claim-text">${esc(c.claim)}</p>
      <p class="claim-ev">${esc(c.evidence)}${citeLinks(c.citations, refs)}</p>
    </div>`;
  });
}

export function fillEvidence(ev, root = document) {
  root.querySelectorAll('[data-ev]').forEach((el) => {
    const v = el.dataset.ev.split('.').reduce((o, k) => o?.[k], ev);
    if (v != null) el.textContent = v;
  });
}

const SETTINGS_COPY = {
  'address-zone': (s, cite) => `
    <p><strong>Map Visibility → hide the map near an address.</strong> <span class="tag-default">Default: off</span></p>
    <p>Applies to past and future activities. The other two map options (hide start/end, hide entire map) only affect runs saved after you turn them on.${cite(['strava-map'])}</p>`,
  'map-summary': (s, cite) => `
    <ul>
      <li><strong>Hide start &amp; end</strong>: on by default at 200 m. <em>Future runs only.</em></li>
      <li><strong>Hide near an address</strong>: off by default. <em>Past and future runs.</em></li>
      <li><strong>Hide entire map</strong>: off by default. <em>Future runs only.</em></li>
    </ul>
    <p>None of these removes the elevation chart, the timestamps or the stats.${cite(['strava-map', 'strava-defaults'])}</p>`,
  'activity-visibility': (s, cite) => `
    <p><strong>Activity visibility → Followers or Only You.</strong> <span class="tag-default">Default: Everyone</span></p>
    <p>Followers still see everything. With a profile set to Everyone (also the default), anyone can follow without approval.${cite(['strava-defaults', 'strava-profile', 'strava-activity'])}</p>
    <p><strong>Hidden details → start time</strong> hides the clock time, but the date and weekday remain.${cite(['strava-hidden'])}</p>`,
  'norm-home': (s, cite) => `
    <p><strong>Map Visibility → hide near an address.</strong> <span class="tag-default">Default: off</span></p>
    <p>The only map setting that also covers past runs. Hide start &amp; end is on at 200 m by default but only covers runs saved after it was on.${cite(['strava-map'])}</p>`,
  'norm-routine': (s, cite) => `
    <p><strong>Activity visibility → Followers or Only You.</strong> <span class="tag-default">Default: Everyone</span></p>
    <p>Limits who can see the timestamps. Hiding the start time removes the clock time, but the date and weekday remain.${cite(['strava-defaults', 'strava-hidden'])}</p>`,
  'norm-identity': (s, cite) => `
    <p><strong>Profile visibility → Followers.</strong> <span class="tag-default">Default: Everyone</span></p>
    <p>With the default, the profile page is public and may be indexed by search engines. What goes in the bio is the runner’s choice.${cite(['strava-profile', 'strava-privacy'])}</p>`,
  'camera': (s, cite) => `
    <p><strong>Hide start &amp; end, or Activity visibility → Followers.</strong></p>
    <p>Hiding the start and end blurs the place. Setting activities to Followers limits who sees the time. Neither one removes a camera’s own footage.${cite(['strava-map', 'strava-defaults'])}</p>`,
};

// ---- plain-language terms (shown inline in Part 2 and in the sidebar) ----
export const TERMS = [
  { k: 'Map Visibility', d: 'A group of Strava settings that control how much of your route other people see on the map. It has three options: hide the start and end, hide the map near an address, or hide the entire map.' },
  { k: 'Hidden start and end', d: 'Strava leaves out the first and last part of your route (200 m by default) so strangers can’t see exactly where you begin and finish. It only applies to runs saved after the setting is on.' },
  { k: 'Future vs. past activities', d: 'Most map settings only change runs you upload from now on. Runs already on your profile stay as they were, unless you use the address option.' },
  { k: 'Elevation profile', d: 'A chart under each activity showing how high or low the route goes along the way. It still shows when the map is hidden, and because hills differ from place to place, it can hint at where a run happened.' },
];
export function renderTerms(refs, root = document) {
  const list = `<dl class="term-list">${TERMS.map((t) => `<div><dt>${t.k}</dt><dd>${t.d}</dd></div>`).join('')}</dl>`;
  root.querySelectorAll('aside.terms').forEach((el) => {
    el.innerHTML = `<p class="setting-k"><span>In plain words</span></p>${list}`;
  });
  const panel = document.getElementById('panel-terms');
  if (panel) panel.innerHTML = `<h2 class="drawer-h">Plain-language terms</h2>${list}`;
}

export function renderLabelsPanel() {
  const panel = document.getElementById('panel-labels');
  if (!panel) return;
  const row = (level, what, ex) => `<div class="lab" data-level="${level}">
    <span class="badge" data-level="${level}">${badgeHTML(level)}</span>
    <p class="lab-what">${what}</p>
    <p class="lab-ex"><em>Example:</em> ${ex}</p></div>`;
  panel.innerHTML = `<h2 class="drawer-h">How we label claims</h2>
    <p class="drawer-lede">Every claim about Millie gets one of three labels, so you can tell what is seen from what is guessed.</p>
    ${row('observed', 'Anyone can see this directly on a public page, like someone’s bio.', 'Her bio says “Barnard ’27.”')}
    ${row('inferred', 'We figured this out from things that are observed. We show the evidence, based on our simulated data.', 'Her runs start on the same block, so she is probably based nearby.')}
    ${row('unsupported', 'It might seem true, but the evidence doesn’t prove it.', 'Which building she lives in.')}
    <p class="drawer-foot">Repetition strengthens a claim: one run is weak evidence, many runs at the same time and place are strong.</p>`;
}
export function renderSettings(settings, refs, root = document) {
  const cite = (keys) => citeLinks(keys, refs);
  root.querySelectorAll('aside.setting[data-setting]').forEach((el) => {
    const f = SETTINGS_COPY[el.dataset.setting];
    if (!f) return;
    el.innerHTML = `<p class="setting-k">${ICONS.lock}<span>The setting that limits it</span></p>${f(settings, cite)}`;
  });
}

export function renderReferences(refs, el, prefix = 'ref-') {
  el.innerHTML = refs.map((r) => `<li id="${prefix}${r.key}">${esc(r.apa)}${r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.url)}</a>` : ''}${r.added ? ' <span class="added">(Added during site fact-check.)</span>' : ''}</li>`).join('');
}

// ---- Generic fitness-app activity card (our own design; not any real app's UI) ----
export function activityCard(el, { profile, act, routeFeature }) {
  const d = new Date(act.start);
  const when = d.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  const mins = Math.floor(act.moving_time_s / 60), secs = act.moving_time_s % 60;
  // route thumbnail as SVG polyline, simple equirectangular projection
  const cs = routeFeature.geometry.coordinates;
  const k = Math.cos((cs[0][1] * Math.PI) / 180);
  const xs = cs.map((c) => c[0] * k), ys = cs.map((c) => -c[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const W = 320, H = 140, pad = 14;
  const s = Math.min((W - 2 * pad) / (x1 - x0), (H - 2 * pad) / (y1 - y0));
  const ox = (W - s * (x1 - x0)) / 2, oy = (H - s * (y1 - y0)) / 2;
  const pts = cs.map((c, i) => `${(ox + (xs[i] - x0) * s).toFixed(1)},${(oy + (ys[i] - y0) * s).toFixed(1)}`).join(' ');
  el.innerHTML = `
    <article class="mock" aria-label="Fictional mockup of a fitness app activity">
      <div class="mock-label">Fictional mockup. Not affiliated with Strava.</div>
      <div class="act-head">
        <div class="avatar" aria-hidden="true">${esc(profile.avatar.text)}</div>
        <div><div class="act-who">${esc(profile.display_name)}</div><div class="act-meta">${esc(when)} · New York, NY</div></div>
      </div>
      <h3 class="act-title">Thursday morning run</h3>
      <div class="act-stats">
        <div><span class="k">Distance</span><span class="v">${(act.distance_m / 1000).toFixed(2)} km</span></div>
        <div><span class="k">Pace</span><span class="v">${act.avg_pace} /km</span></div>
        <div><span class="k">Time</span><span class="v">${mins}m ${String(secs).padStart(2, '0')}s</span></div>
      </div>
      <svg class="act-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Route thumbnail: a loop through Morningside Heights">
        <rect width="${W}" height="${H}" fill="#eef0ec"/>
        <polyline points="${pts}" fill="none" stroke="#c2417a" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
      <div class="act-foot"><span class="vis-pill">${ICONS.lock.replace('viewBox', 'width="12" height="12" viewBox')} Visible to: Everyone</span><span>Avg HR ${act.avg_hr} bpm</span></div>
    </article>`;
}
