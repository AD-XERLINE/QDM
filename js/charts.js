// SVG charts. Pure helpers are exported for tests; render functions touch the DOM only when called.
import { tc, breakEvenPrice } from './model.js';

const M = { top: 28, right: 24, bottom: 56, left: 92 };
// Drawing size follows the SVG's on-screen box so text stays 13px at any width.
let W = 800, H = 360, X0, X1, Y0, Y1;
function fit(svg) {
  W = Math.max(280, Math.round(svg.clientWidth) || 800);
  H = Math.max(240, Math.round(svg.clientHeight) || 360);
  X0 = M.left; X1 = W - M.right; Y0 = M.top; Y1 = H - M.bottom;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
}
fit({ clientWidth: 0, clientHeight: 0, setAttribute() {} });
const SAMPLES = 200;
const NS = 'http://www.w3.org/2000/svg';

const fmt = (v, dp = 0) => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const tierColor = i => `var(--tier-${(i % 6) + 1})`;

// ---------- pure helpers ----------
export function qMax(tiers, results, qn) {
  const lastMin = tiers[tiers.length - 1].minQty;
  const topStar = Math.max(...results.map(r => r.qStar));
  return Math.ceil(Math.max(1.25 * lastMin, 3 * topStar, 1.2 * qn) / 100) * 100;
}

export function linearScale([d0, d1], [r0, r1]) {
  const k = (r1 - r0) / (d1 - d0);
  return { to: v => r0 + (v - d0) * k, from: px => d0 + (px - r0) / k };
}

export function tcYDomain(view, xMax) {
  const totals = view.results.filter(r => r.cost).map(r => r.cost.total);
  const tcBest = view.best.cost.total;
  const tcProp = view.proposal.cost.total;
  // Scale from the shop's offers, not the proposal, so the diamond moves when the lot changes;
  // the axis only stretches when the proposal would leave the chart.
  // Floor: how far the best price's TC rises at Q*/2 or 2Q* (needed when there is one tier).
  const { D, S, I } = view.params;
  const curveRise = 0.25 * Math.sqrt(2 * D * S * I * view.best.price);
  const span = Math.max(Math.max(...totals) - tcBest, curveRise);
  return [
    Math.min(tcBest - 0.4 * span, tcProp - 0.3 * span), // room below the lines for labels
    Math.max(tcBest + 1.6 * span, tcProp + 0.3 * span),
  ];
}

function niceTicks(lo, hi, count = 5) {
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
  return { ticks, step };
}

// ---------- svg helpers ----------
function el(tag, attrs = {}, style = '') {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (style) node.setAttribute('style', style);
  return node;
}
function text(x, y, str, attrs = {}, style = '') {
  const t = el('text', { x, y, ...attrs }, style);
  t.textContent = str;
  return t;
}
const clampY = y => Math.max(Y0 - 40, Math.min(Y1 + 40, y));

function pathFor(fn, qa, qb, xs, ys) {
  if (qb <= qa) return '';
  let d = '';
  for (let k = 0; k <= SAMPLES; k++) {
    const q = qa + ((qb - qa) * k) / SAMPLES;
    d += `${k ? 'L' : 'M'}${xs.to(q).toFixed(1)},${clampY(ys.to(fn(q))).toFixed(1)}`;
  }
  return d;
}

function frame(svg, id, xs, ys, yTicks, yFmt, yTitle) {
  const g = el('g');
  const clip = el('clipPath', { id });
  clip.append(el('rect', { x: X0, y: Y0, width: X1 - X0, height: Y1 - Y0 }));
  g.append(clip);
  for (const v of yTicks) {
    const y = ys.to(v);
    g.append(el('line', { x1: X0, x2: X1, y1: y, y2: y, class: 'grid' }));
    g.append(text(X0 - 8, y + 4, yFmt(v), { 'text-anchor': 'end' }));
  }
  for (const v of niceTicks(xs.from(X0), xs.from(X1), 6).ticks) {
    if (v < 1) continue;
    const x = xs.to(v);
    g.append(el('line', { x1: x, x2: x, y1: Y1, y2: Y1 + 5 }, 'stroke:var(--muted)'));
    g.append(text(x, Y1 + 20, fmt(v), { 'text-anchor': 'middle' }));
  }
  g.append(el('line', { x1: X0, x2: X1, y1: Y1, y2: Y1 }, 'stroke:var(--muted)'));
  g.append(text((X0 + X1) / 2, H - 10, 'ปริมาณสั่งซื้อต่อครั้ง (Q)', { 'text-anchor': 'middle', class: 'axis-title' }));
  g.append(text(14, (Y0 + Y1) / 2, yTitle, { 'text-anchor': 'middle', class: 'axis-title', transform: `rotate(-90 14 ${(Y0 + Y1) / 2})` }));
  return g;
}

function priceBreakLines(g, view, xs, xMax) {
  for (const t of view.tiers) {
    if (t.minQty <= 0 || t.minQty > xMax) continue;
    const x = xs.to(t.minQty);
    g.append(el('line', { x1: x, x2: x, y1: Y0, y2: Y1 }, 'stroke:var(--muted);stroke-dasharray:4 4;opacity:.6'));
  }
}

// ---------- drag state (shared by both charts so the x axis stays frozen while dragging) ----------
const drag = { active: false, xMax: 0 };
const xMaxFor = view => (drag.active ? drag.xMax : qMax(view.tiers, view.results, view.qn));

// ---------- chart 1: TC vs Q ----------
const tcState = new WeakMap(); // svg -> { layer, diamond, label, xs, xMax, onDragQ }

function ensureTcChart(svg) {
  let s = tcState.get(svg);
  if (s) return s;
  svg.replaceChildren();
  svg.setAttribute('role', 'img');
  const layer = el('g');
  const handle = el('g', { class: 'drag', tabindex: '-1' });
  const diamond = el('path', { d: 'M0,-11 L11,0 L0,11 L-11,0 Z' }, 'fill:var(--proposal);stroke:#fff;stroke-width:2.5');
  const hit = el('circle', { r: 22 }, 'fill:transparent');
  handle.append(hit, diamond);
  const label = text(0, 0, 'ข้อเสนอต่อรอง (ลากได้)', { 'text-anchor': 'middle', class: 'label-strong' }, 'fill:var(--proposal)');
  svg.append(layer, label, handle);
  s = { layer, handle, label, xs: null, xMax: 0, onDragQ: () => {} };

  const qAt = evt => {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const local = pt.matrixTransform(svg.getScreenCTM().inverse());
    return Math.round(Math.min(drag.xMax, Math.max(1, s.xs.from(local.x))));
  };
  handle.addEventListener('pointerdown', evt => {
    drag.active = true; drag.xMax = s.xMax;
    handle.setPointerCapture(evt.pointerId);
    evt.preventDefault();
  });
  handle.addEventListener('pointermove', evt => { if (drag.active) s.onDragQ(qAt(evt)); });
  const end = q => {
    if (!drag.active) return;
    drag.active = false;
    s.onDragQ(q); // re-render with a fresh axis
  };
  handle.addEventListener('pointerup', evt => end(qAt(evt)));
  // A cancelled pointer carries no reliable position: keep the last rendered lot size.
  handle.addEventListener('pointercancel', () => end(s.qn));
  tcState.set(svg, s);
  return s;
}

export function renderTcChart(svg, view, onDragQ) {
  const s = ensureTcChart(svg);
  fit(svg);
  const { params, results, best, qn, pn, proposal } = view;
  const xMax = xMaxFor(view);
  const xs = linearScale([1, xMax], [X0, X1]);
  const [lo, hi] = tcYDomain(view, xMax);
  const ys = linearScale([lo, hi], [Y1, Y0]);
  const { ticks } = niceTicks(lo, hi, 5);
  Object.assign(s, { xs, xMax, onDragQ, qn });

  const g = frame(svg, 'clip-tc', xs, ys, ticks, v => '฿' + fmt(v), 'TC ต่อปี (฿)');
  priceBreakLines(g, view, xs, xMax);
  const plot = el('g', { 'clip-path': 'url(#clip-tc)' });
  g.append(plot);

  results.forEach(r => {
    const color = tierColor(r.index);
    const f = q => tc(q, r.price, params).total;
    plot.append(el('path', { d: pathFor(f, 1, xMax, xs, ys), fill: 'none' },
      `stroke:${color};stroke-width:2;stroke-dasharray:5 5;opacity:.3`));
    const a = Math.max(1, r.minQty), b = Math.min(r.maxQty, xMax);
    plot.append(el('path', { d: pathFor(f, a, b, xs, ys), fill: 'none' }, `stroke:${color};stroke-width:3.5;stroke-linecap:round`));
  });

  // best TC reference line
  const yb = ys.to(best.cost.total);
  plot.append(el('line', { x1: X0, x2: X1, y1: yb, y2: yb }, 'stroke:var(--text);stroke-width:1.5;stroke-dasharray:8 5;opacity:.55'));
  g.append(text(X1 - 4, yb + 18, 'TC ที่ดีที่สุดของร้าน', { 'text-anchor': 'end' }));

  // proposal curve at the asked price
  plot.append(el('path', { d: pathFor(q => tc(q, pn, params).total, 1, xMax, xs, ys), fill: 'none' },
    'stroke:var(--proposal);stroke-width:2.5;stroke-dasharray:2 6;stroke-linecap:round'));

  // tier points
  results.forEach(r => {
    const color = tierColor(r.index);
    if (r.status !== 'feasible' && r.qStar <= xMax) {
      plot.append(el('circle', { cx: xs.to(r.qStar), cy: clampY(ys.to(tc(r.qStar, r.price, params).total)), r: 5 },
        `fill:var(--surface);stroke:${color};stroke-width:2`));
    }
    if (r.cost && r.qty <= xMax) {
      const isBest = r === best;
      plot.append(el('circle', { cx: xs.to(r.qty), cy: ys.to(r.cost.total), r: isBest ? 8 : 5 },
        `fill:${color};stroke:#fff;stroke-width:2`));
    }
  });
  if (best.qty <= xMax) {
    const bx = xs.to(best.qty);
    const anchor = bx > (X0 + X1) / 2 ? 'end' : 'start';
    g.append(text(bx + (anchor === 'start' ? 12 : -12), yb - 14,
      `ดีที่สุดของร้าน: ${fmt(best.qty)} @ ฿${fmt(best.price, 2)}`, { 'text-anchor': anchor, class: 'label-strong' }));
  }

  s.layer.replaceWith(g);
  s.layer = g;

  // proposal handle (kept across renders so pointer capture survives)
  const px = xs.to(qn), py = Math.max(Y0, Math.min(Y1, ys.to(proposal.cost.total)));
  s.handle.setAttribute('transform', `translate(${px.toFixed(1)},${py.toFixed(1)})`);
  // put the label on the side away from the best-offer line, where the other labels sit;
  // with no room below, put it beside the diamond instead of on top of the other labels
  const beside = py >= yb && py > Y1 - 40;
  if (beside) {
    const left = px - X0 > X1 - px;
    s.label.setAttribute('text-anchor', left ? 'end' : 'start');
    s.label.setAttribute('x', (px + (left ? -18 : 18)).toFixed(1));
    s.label.setAttribute('y', (py + 5).toFixed(1));
  } else {
    const above = py < yb && py - Y0 > 24;
    s.label.setAttribute('text-anchor', 'middle');
    s.label.setAttribute('x', Math.max(X0 + 70, Math.min(X1 - 70, px)).toFixed(1));
    s.label.setAttribute('y', (py + (above ? -18 : 30)).toFixed(1));
  }

  svg.setAttribute('aria-label',
    `กราฟ TC: ข้อเสนอที่ดีที่สุดของร้านคือ ${fmt(best.qty)} ชิ้นที่ ฿${fmt(best.price, 2)} TC ฿${fmt(best.cost.total)}; ` +
    `ข้อเสนอต่อรอง ${fmt(qn)} ชิ้นที่ ฿${fmt(pn, 2)} TC ฿${fmt(proposal.cost.total)}`);
}

// ---------- chart 2: break-even price vs Q ----------
export function renderPriceChart(svg, view) {
  fit(svg);
  const { params, tiers, results, best, qn, pn, proposal } = view;
  const xMax = xMaxFor(view);
  const xs = linearScale([1, xMax], [X0, X1]);
  const prices = [...tiers.map(t => t.price), pn];
  const lo = Math.min(...prices) * 0.97, hi = Math.max(...prices) * 1.01;
  const ys = linearScale([lo, hi], [Y1, Y0]);
  const { ticks, step } = niceTicks(lo, hi, 5);
  const dp = step < 0.1 ? 2 : 1;
  const tcBest = best.cost.total;
  const be = q => breakEvenPrice(q, tcBest, params);

  svg.setAttribute('role', 'img');
  const g = frame(svg, 'clip-price', xs, ys, ticks, v => '฿' + fmt(v, dp), 'ราคาต่อหน่วย (฿)');
  priceBreakLines(g, view, xs, xMax);
  const plot = el('g', { 'clip-path': 'url(#clip-price)' });
  g.append(plot);

  // benefit zone under the break-even curve
  const curve = pathFor(be, 1, xMax, xs, ys);
  plot.append(el('path', { d: `${curve}L${X1},${Y1 + 40}L${X0},${Y1 + 40}Z` }, 'fill:var(--good-soft);opacity:.85'));
  plot.append(el('path', { d: curve, fill: 'none' }, 'stroke:var(--good);stroke-width:3'));

  // shop price steps
  let d = '';
  results.forEach((r, i) => {
    const a = Math.max(1, r.minQty);
    if (a > xMax) return;
    const b = Math.min(r.maxQty === Infinity ? xMax : r.maxQty + 1, xMax);
    d += `${i ? 'L' : 'M'}${xs.to(a).toFixed(1)},${ys.to(r.price).toFixed(1)}H${xs.to(b).toFixed(1)}`;
  });
  plot.append(el('path', { d, fill: 'none' }, 'stroke:var(--text);stroke-width:2.5;opacity:.8'));
  results.forEach(r => {
    const a = Math.max(1, r.minQty);
    if (a > xMax) return;
    const b = Math.min(r.maxQty === Infinity ? xMax : r.maxQty + 1, xMax);
    plot.append(el('line', { x1: xs.to(a), x2: xs.to(b), y1: ys.to(r.price), y2: ys.to(r.price) },
      `stroke:${tierColor(r.index)};stroke-width:5;opacity:.35`));
  });

  // zone label under the curve's highest point
  let peakQ = 1, peak = -Infinity;
  for (let k = 0; k <= SAMPLES; k++) {
    const q = 1 + ((xMax - 1) * k) / SAMPLES;
    if (be(q) > peak) { peak = be(q); peakQ = q; }
  }
  const zx = Math.max(X0 + 140, Math.min(X1 - 140, xs.to(peakQ)));
  g.append(text(zx, Y1 - 12, 'ต่อรองได้ในโซนนี้ เราได้ประโยชน์', { 'text-anchor': 'middle', class: 'label-strong' }, 'fill:var(--good)'));

  // legend
  const lg = el('g', { transform: `translate(${X1 - 250},${Y0 + 4})` });
  lg.append(el('rect', { x: -10, y: -14, width: 258, height: 26, rx: 8 }, 'fill:var(--surface);opacity:.9'));
  lg.append(el('line', { x1: 0, x2: 22, y1: 0, y2: 0 }, 'stroke:var(--text);stroke-width:2.5'));
  lg.append(text(28, 4, 'ราคาของร้าน'));
  lg.append(el('line', { x1: 118, x2: 140, y1: 0, y2: 0 }, 'stroke:var(--good);stroke-width:3'));
  lg.append(text(146, 4, 'ราคาเท่าทุน'));
  g.append(lg);

  // best point and proposal point
  if (best.qty <= xMax) {
    g.append(el('circle', { cx: xs.to(best.qty), cy: ys.to(best.price), r: 6 }, `fill:${tierColor(best.index)};stroke:#fff;stroke-width:2`));
  }
  const good = proposal.saving >= 0;
  const color = good ? 'var(--good)' : 'var(--bad)';
  const px = xs.to(qn), py = Math.max(Y0, Math.min(Y1, ys.to(pn)));
  g.append(el('path', { d: 'M0,-10 L10,0 L0,10 L-10,0 Z', transform: `translate(${px.toFixed(1)},${py.toFixed(1)})` },
    'fill:var(--proposal);stroke:#fff;stroke-width:2.5'));
  const lx = Math.max(X0 + 60, Math.min(X1 - 60, px));
  g.append(text(lx, py - 16, good ? '✓ ได้ประโยชน์' : '✗ แพงกว่าเดิม', { 'text-anchor': 'middle', class: 'label-strong' }, `fill:${color}`));

  svg.replaceChildren(g);
  const bq = be(qn);
  svg.setAttribute('aria-label',
    `กราฟราคาเท่าทุน: ที่ล็อต ${fmt(qn)} ชิ้น ราคาเท่าทุนคือ ${bq > 0 ? '฿' + fmt(bq, 3) : 'ไม่มี'}; ` +
    `ข้อเสนอ ฿${fmt(pn, 2)} ${good ? 'ได้ประโยชน์' : 'แพงกว่าเดิม'}`);
}
