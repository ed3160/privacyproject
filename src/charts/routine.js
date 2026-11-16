import { select, scaleBand, scaleSequential, scaleTime, interpolateRgb, max, axisBottom, axisLeft, timeMonth, timeFormat, utcDay } from 'd3';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FULL = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
const fmtHour = (h) => (h === 0 ? '12 a.m.' : h < 12 ? `${h} a.m.` : h === 12 ? 'noon' : `${h - 12} p.m.`);

function tooltip() {
  let el = document.querySelector('.tooltip');
  if (!el) { el = document.createElement('div'); el.className = 'tooltip'; el.hidden = true; document.body.append(el); }
  return {
    show(html, ev) { el.innerHTML = html; el.hidden = false; el.style.left = `${ev.clientX + 12}px`; el.style.top = `${ev.clientY + 12}px`; },
    hide() { el.hidden = true; },
  };
}

export function createRoutine({ heatEl, calEl, titleEl, data, srHeat, srGaps }) {
  const acts = data.activities;
  const tip = tooltip();
  const localHour = (a) => +a.start.slice(11, 13);
  const dayIdx = (a) => DAYS.indexOf(a.weekday);

  // ---------- weekday × hour heatmap ----------
  const H0 = 5, H1 = 21;
  const hours = Array.from({ length: H1 - H0 + 1 }, (_, i) => H0 + i);
  const counts = new Map();
  for (const a of acts) { const k = `${a.weekday}|${localHour(a)}`; counts.set(k, (counts.get(k) || 0) + 1); }
  const cells = DAYS.flatMap((d) => hours.map((h) => ({ d, h, n: counts.get(`${d}|${h}`) || 0 })));
  const top = [...cells].sort((a, b) => b.n - a.n).slice(0, 3);
  srHeat.textContent = `Chart: runs by weekday and hour. Busiest cells: ${top.map((c) => `${FULL[c.d]} ${fmtHour(c.h)} (${c.n} runs)`).join('; ')}. Most other cells are empty.`;

  const W = 640, Hh = 250, m = { t: 8, r: 8, b: 30, l: 40 };
  const x = scaleBand(hours, [m.l, W - m.r]).padding(0.08);
  const y = scaleBand(DAYS, [m.t, Hh - m.b]).padding(0.08);
  const color = scaleSequential([0, max(cells, (c) => c.n)], interpolateRgb('#f6e6ed', '#8e2157'));
  const svgH = select(heatEl).append('svg').attr('viewBox', `0 0 ${W} ${Hh}`).attr('role', 'img').attr('aria-label', srHeat.textContent);
  svgH.append('g').selectAll('rect').data(cells).join('rect')
    .attr('x', (c) => x(c.h)).attr('y', (c) => y(c.d)).attr('width', x.bandwidth()).attr('height', y.bandwidth())
    .attr('rx', 3).attr('fill', (c) => (c.n ? color(c.n) : '#efede8'))
    .on('pointermove', (ev, c) => tip.show(`<strong>${FULL[c.d]}, ${fmtHour(c.h)}</strong><br>${c.n} run${c.n === 1 ? '' : 's'}`, ev))
    .on('pointerleave', () => tip.hide());
  svgH.append('g').attr('class', 'axis').attr('transform', `translate(0,${Hh - m.b})`)
    .call(axisBottom(x).tickValues(hours.filter((h) => h % 3 === 0 || h === 7)).tickFormat(fmtHour).tickSize(0).tickPadding(8)).call((g) => g.select('.domain').remove());
  svgH.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`)
    .call(axisLeft(y).tickSize(0).tickPadding(8)).call((g) => g.select('.domain').remove());
  // direct labels on the three standout cells
  svgH.append('g').selectAll('text').data(top).join('text').attr('class', 'chart-label')
    .attr('x', (c) => x(c.h) + x.bandwidth() / 2).attr('y', (c) => y(c.d) + y.bandwidth() / 2 + 4)
    .attr('text-anchor', 'middle').style('fill', '#fff').style('font-weight', 600).text((c) => c.n);
  select(heatEl).append('p').attr('class', 'chart-note').text(`Cells show the number of runs that started in each hour, ${data.range.start} to ${data.range.end}. Hover for details.`);

  // ---------- year calendar strip ----------
  const parse = (s) => new Date(s + 'T00:00:00Z');
  const start = parse(data.range.start), end = parse(data.range.end);
  const Wc = 640, Hc = 200, mc = { t: 30, r: 8, b: 26, l: 40 };
  const xc = scaleTime([start, utcDay.offset(end, 1)], [mc.l, Wc - mc.r]);
  const yc = scaleBand(DAYS, [mc.t, Hc - mc.b]).padding(0.15);
  const dayW = (Wc - mc.l - mc.r) / ((end - start) / 864e5 + 1);
  const svgC = select(calEl).append('svg').attr('viewBox', `0 0 ${Wc} ${Hc}`).attr('role', 'img')
    .attr('aria-label', `Calendar of ${acts.length} runs over one year, one mark per run, by weekday.`);
  // weekday guide rows
  svgC.append('g').selectAll('rect').data(DAYS).join('rect').attr('x', mc.l).attr('width', Wc - mc.l - mc.r)
    .attr('y', (d) => yc(d)).attr('height', yc.bandwidth()).attr('fill', (d) => (['Tue', 'Thu', 'Sun'].includes(d) ? '#f3ece8' : '#f6f5f1'));
  // gap bands (hidden until the gaps state)
  const gapG = svgC.append('g').attr('class', 'gaps').style('opacity', 0);
  const gaps = data.gaps;
  gapG.selectAll('rect').data(gaps).join('rect')
    .attr('x', (g) => xc(parse(g.start))).attr('width', (g) => xc(utcDay.offset(parse(g.end), 1)) - xc(parse(g.start)))
    .attr('y', mc.t - 4).attr('height', Hc - mc.t - mc.b + 8).attr('fill', 'url(#hatch)').attr('stroke', '#8a877f').attr('stroke-dasharray', '3 3');
  gapG.selectAll('text').data(gaps).join('text').attr('class', 'chart-label')
    .attr('x', (g) => (xc(parse(g.start)) + xc(parse(g.end))) / 2).attr('y', mc.t - 10).attr('text-anchor', 'middle')
    .style('fill', '#55524b').style('font-weight', 600).text('?');
  const defs = svgC.append('defs');
  const pat = defs.append('pattern').attr('id', 'hatch').attr('width', 6).attr('height', 6).attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)');
  pat.append('rect').attr('width', 6).attr('height', 6).attr('fill', '#f0efec');
  pat.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6).attr('stroke', '#c9c6be').attr('stroke-width', 2);

  svgC.append('g').selectAll('rect').data(acts).join('rect')
    .attr('x', (a) => xc(parse(a.start.slice(0, 10)))).attr('width', Math.max(2, dayW))
    .attr('y', (a) => yc(a.weekday)).attr('height', yc.bandwidth()).attr('rx', 1)
    .attr('fill', (a) => (a.slot === 'extra' ? '#e7a9c4' : '#c2417a'))
    .on('pointermove', (ev, a) => tip.show(`<strong>${a.weekday} ${a.start.slice(0, 10)}</strong><br>Start ${a.start.slice(11, 16)} · ${(a.distance_m / 1000).toFixed(1)} km`, ev))
    .on('pointerleave', () => tip.hide());
  svgC.append('g').attr('class', 'axis').attr('transform', `translate(0,${Hc - mc.b})`)
    .call(axisBottom(xc).ticks(timeMonth.every(2)).tickFormat(timeFormat('%b %Y')).tickSize(0).tickPadding(8)).call((g) => g.select('.domain').remove());
  svgC.append('g').attr('class', 'axis').attr('transform', `translate(${mc.l},0)`)
    .call(axisLeft(yc).tickSize(0).tickPadding(8)).call((g) => g.select('.domain').remove());
  const calNote = select(calEl).append('p').attr('class', 'chart-note')
    .text('Each mark is one run. Lighter marks are one-off runs outside the usual three slots.');
  const fmtD = (s) => parse(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  srGaps.textContent = `Chart: the same calendar with three gaps shaded and marked with a question mark: ${gaps.map((g) => `${fmtD(g.start)} to ${fmtD(g.end)}`).join('; ')}.`;

  function setState(state) {
    const heat = state === 'heat';
    heatEl.hidden = !heat;
    calEl.hidden = heat;
    titleEl.textContent = heat ? 'Runs by weekday and hour' : state === 'gaps' ? 'Three gaps. The data can’t say why.' : 'A year of runs';
    gapG.transition().duration(400).style('opacity', state === 'gaps' ? 1 : 0);
    calNote.text(state === 'gaps'
      ? 'Shaded: stretches with few or no runs. Any reason you might guess is unsupported by the data.'
      : 'Each mark is one run. Lighter marks are one-off runs outside the usual three slots.');
  }
  return { setState };
}
