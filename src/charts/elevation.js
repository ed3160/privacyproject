import { select, scaleLinear, area, line, extent, axisBottom, axisLeft, pointer, bisector } from 'd3';

export function createElevation(el, hero) {
  const pts = hero.dist_m.map((d, i) => ({ d: d / 1000, e: hero.ele_m[i] }));
  const W = 360, H = 130, m = { t: 14, r: 10, b: 24, l: 34 };
  const x = scaleLinear(extent(pts, (p) => p.d), [m.l, W - m.r]);
  const y = scaleLinear([0, Math.ceil(Math.max(...hero.ele_m) / 10) * 10], [H - m.b, m.t]);
  const iMin = hero.ele_m.indexOf(Math.min(...hero.ele_m));
  const iMax = hero.ele_m.indexOf(Math.max(...hero.ele_m));
  const label = `Elevation profile of the run: from ${Math.round(hero.ele_m[iMin])} m at ${pts[iMin].d.toFixed(1)} km to ${Math.round(hero.ele_m[iMax])} m at ${pts[iMax].d.toFixed(1)} km.`;
  el.setAttribute('aria-label', label);
  const svg = select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('aria-hidden', 'true');
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
    .call(axisBottom(x).ticks(5).tickFormat((d) => `${d} km`).tickSize(0).tickPadding(6)).call((g) => g.select('.domain').attr('stroke', '#e4e1d9'));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`)
    .call(axisLeft(y).ticks(3).tickFormat((d) => `${d} m`).tickSize(-(W - m.l - m.r)).tickPadding(4))
    .call((g) => { g.select('.domain').remove(); g.selectAll('line').attr('stroke', '#efede8'); });
  svg.append('path').datum(pts).attr('fill', '#f4dbe6').attr('d', area().x((p) => x(p.d)).y0(y(0)).y1((p) => y(p.e)));
  svg.append('path').datum(pts).attr('fill', 'none').attr('stroke', '#c2417a').attr('stroke-width', 2).attr('d', line().x((p) => x(p.d)).y((p) => y(p.e)));
  for (const [i, anchor, dy] of [[iMin, 'start', 14], [iMax, 'middle', -6]]) {
    svg.append('circle').attr('cx', x(pts[i].d)).attr('cy', y(pts[i].e)).attr('r', 3.5).attr('fill', '#fff').attr('stroke', '#1b1a17').attr('stroke-width', 1.5);
    svg.append('text').attr('class', 'chart-label').attr('x', x(pts[i].d) + (anchor === 'start' ? 6 : 0)).attr('y', y(pts[i].e) + dy)
      .attr('text-anchor', anchor).style('fill', '#1b1a17').text(`${Math.round(pts[i].e)} m`);
  }
  // hover crosshair
  const cross = svg.append('g').style('display', 'none');
  cross.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', '#55524b').attr('stroke-width', 1);
  const ct = cross.append('text').attr('class', 'chart-label').attr('y', m.t - 2).style('fill', '#1b1a17');
  const bis = bisector((p) => p.d).center;
  svg.append('rect').attr('x', m.l).attr('y', 0).attr('width', W - m.l - m.r).attr('height', H).attr('fill', 'transparent')
    .on('pointermove', (ev) => {
      const p = pts[bis(pts, x.invert(pointer(ev)[0]))];
      cross.style('display', null).attr('transform', `translate(${x(p.d)},0)`);
      ct.attr('text-anchor', x(p.d) > W / 2 ? 'end' : 'start').attr('x', x(p.d) > W / 2 ? -4 : 4).text(`${p.d.toFixed(2)} km · ${p.e.toFixed(0)} m`);
    })
    .on('pointerleave', () => cross.style('display', 'none'));
}
