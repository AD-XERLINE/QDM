import { evaluateTiers, bestOffer, suggestProposal, evaluateProposal } from './model.js';
import { DEFAULT_STATE, MAX_TIERS, validate, encodeState, decodeState } from './state.js';

const $ = id => document.getElementById(id);

// ---------- formatting ----------
const fmt = (v, dp) => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const baht = (v, dp = 2) => (v < 0 ? '−฿' : '฿') + fmt(Math.abs(v), dp);
const qty = v => fmt(v, Number.isInteger(v) ? 0 : 1);
const tierColor = i => `var(--tier-${(i % 6) + 1})`;
const STATUS = { feasible: 'ใช้ได้', adjusted: 'ปรับขึ้น', discarded: 'ตัดทิ้ง' };

// ---------- view model ----------
export function computeView(state) {
  const params = { D: state.D, S: state.S, I: state.I };
  const results = evaluateTiers(params, state.tiers);
  const best = bestOffer(results);
  const suggested = suggestProposal(params, best);
  const qn = state.qn ?? suggested.qn;
  const pn = state.pn ?? suggested.pn;
  return { params, tiers: state.tiers, results, best, qn, pn, proposal: evaluateProposal(qn, pn, params, best) };
}

// shortcut: interim lot-size axis until charts.js provides qMax
function qMax(tiers, results, qn) {
  const lastMin = tiers[tiers.length - 1].minQty;
  const topStar = Math.max(...results.map(r => r.qStar));
  return Math.ceil(Math.max(1.25 * lastMin, 3 * topStar, 1.2 * qn) / 100) * 100;
}

// ---------- state ----------
let state = decodeState(location.hash);
let view = null;

function setState(patch, { rebuildTiers = false } = {}) {
  state = { ...state, ...patch };
  if (rebuildTiers) buildTierRows();
  render();
}

// Moving either proposal control pins both, so later assumption changes keep the user's offer.
function pinProposal(patch) {
  const base = view ? { qn: view.qn, pn: view.pn } : {};
  setState({ ...base, ...patch });
}

export function setProposalQty(qn) {
  pinProposal({ qn });
}

// ---------- number + slider pairs ----------
const parse = v => (v.trim() === '' ? NaN : Number(v));

function bindPair(key, { toState = v => v, fromState = v => v, onChange }) {
  const range = $(`${key}-range`);
  const num = $(`${key}-num`);
  range.addEventListener('input', () => {
    num.value = range.value;
    onChange(toState(Number(range.value)));
  });
  num.addEventListener('input', () => {
    const v = parse(num.value);
    if (Number.isFinite(v) && v > Number(range.max)) range.max = String(v * 2);
    if (Number.isFinite(v)) range.value = String(v);
    onChange(toState(v));
  });
  return value => {
    const shown = fromState(value);
    if (document.activeElement !== num) num.value = String(+shown.toFixed(4));
    if (shown > Number(range.max)) range.max = String(shown * 2);
    range.value = String(shown);
  };
}

const syncD = bindPair('D', { onChange: D => setState({ D }) });
const syncS = bindPair('S', { onChange: S => setState({ S }) });
const syncI = bindPair('I', { toState: v => v / 100, fromState: v => v * 100, onChange: I => setState({ I }) });
const syncQn = bindPair('qn', { onChange: qn => pinProposal({ qn }) });
const syncPn = bindPair('pn', { onChange: pn => pinProposal({ pn }) });

// ---------- tier editor ----------
function buildTierRows() {
  const body = $('tier-rows');
  body.replaceChildren();
  state.tiers.forEach((t, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <th scope="row"><span class="tier-tag"><span class="swatch" style="background:${tierColor(i)}"></span>${i + 1}</span></th>
      <td><input type="number" step="1" min="0" inputmode="numeric" aria-label="ช่วง ${i + 1} สั่งตั้งแต่ (ชิ้น)" aria-describedby="tier-${i}-min-err" ${i === 0 ? 'readonly' : ''}>
          <p class="err" id="tier-${i}-min-err" role="alert"></p></td>
      <td><input type="number" step="0.01" min="0" inputmode="decimal" aria-label="ช่วง ${i + 1} ราคา (บาท)" aria-describedby="tier-${i}-price-err">
          <p class="err" id="tier-${i}-price-err" role="alert"></p></td>
      <td>${i === 0 ? '' : `<button type="button" class="icon-btn" aria-label="ลบช่วง ${i + 1}">✕</button>`}</td>`;
    const [minInput, priceInput] = tr.querySelectorAll('input');
    minInput.value = t.minQty;
    priceInput.value = t.price;
    const update = (field, input) => input.addEventListener('input', () => {
      const tiers = state.tiers.map((row, j) => (j === i ? { ...row, [field]: parse(input.value) } : row));
      setState({ tiers });
    });
    if (i > 0) update('minQty', minInput);
    update('price', priceInput);
    tr.querySelector('button')?.addEventListener('click', () => {
      setState({ tiers: state.tiers.filter((_, j) => j !== i) }, { rebuildTiers: true });
    });
    body.append(tr);
  });
  $('add-tier').disabled = state.tiers.length >= MAX_TIERS;
}

$('add-tier').addEventListener('click', () => {
  const last = state.tiers[state.tiers.length - 1];
  const next = { minQty: last.minQty + 1000, price: Math.round(last.price * 0.99 * 100) / 100 };
  setState({ tiers: [...state.tiers, next] }, { rebuildTiers: true });
});

// ---------- errors ----------
function showErrors(errors) {
  for (const key of ['D', 'S', 'I', 'qn', 'pn']) {
    $(`${key}-err`).textContent = errors[key] ?? '';
    $(`${key}-num`).setAttribute('aria-invalid', String(Boolean(errors[key])));
  }
  state.tiers.forEach((_, i) => {
    const e = errors.tiers?.[i] ?? {};
    const minErr = $(`tier-${i}-min-err`);
    const priceErr = $(`tier-${i}-price-err`);
    if (!minErr) return;
    minErr.textContent = e.minQty ?? '';
    priceErr.textContent = e.price ?? '';
    minErr.previousElementSibling.setAttribute('aria-invalid', String(Boolean(e.minQty)));
    priceErr.previousElementSibling.setAttribute('aria-invalid', String(Boolean(e.price)));
  });
  $('tiers-err').textContent = errors.tierCount ?? '';
}

// ---------- outputs ----------
function renderProposal(v) {
  const { proposal: p, best, qn, pn, params } = v;
  const good = p.saving >= 0;
  const verdict = $('verdict');
  verdict.className = `verdict ${good ? 'good' : 'bad'}`;
  verdict.textContent = good ? '✓ ได้ประโยชน์กว่าข้อเสนอของร้าน' : '✗ แพงกว่าข้อเสนอของร้าน';

  $('out-tc').textContent = baht(p.cost.total, 0);
  $('out-tc-meta').textContent = `ร้าน: ${baht(best.cost.total, 0)}`;
  $('out-saving-label').textContent = good ? 'ประหยัดต่อปี' : 'แพงขึ้นต่อปี';
  const saving = $('out-saving');
  saving.textContent = baht(Math.abs(p.saving), 0);
  saving.className = good ? 'good' : 'bad';
  $('out-saving-meta').textContent = `${fmt((Math.abs(p.saving) / best.cost.total) * 100, 2)}% ของ TC`;
  $('out-orders').textContent = `${fmt(p.ordersPerYear, 1)} ครั้ง/ปี`;
  $('out-orders-meta').textContent = `ทุก ${fmt(p.daysBetweenOrders, 0)} วัน (ร้าน: ${fmt(params.D / best.qty, 1)} ครั้ง)`;
  $('out-inv').textContent = `${qty(p.avgInventory)} ชิ้น`;
  $('out-inv-meta').textContent = `ร้าน: ${qty(p.bestAvgInventory)} ชิ้น`;
  $('out-be').textContent = p.breakEven === null ? 'ไม่มีราคาที่คุ้มที่ล็อตนี้' : baht(p.breakEven, 3);
  $('out-be').classList.toggle('small', p.breakEven === null);

  $('summary').textContent = good
    ? `ขอราคา ${baht(pn)} ที่ล็อต ${fmt(qn, 0)} ชิ้น โดยสัญญาซื้อรวม ${fmt(params.D, 0)} ชิ้น/ปี: TC ลดจาก ${baht(best.cost.total, 0)} เหลือ ${baht(p.cost.total, 0)} (ประหยัด ${baht(p.saving, 0)}/ปี) และสต็อกเฉลี่ยเปลี่ยนจาก ${qty(p.bestAvgInventory)} เป็น ${qty(p.avgInventory)} ชิ้น`
    : `ข้อเสนอนี้แพงกว่าข้อเสนอของร้าน ${baht(-p.saving, 0)}/ปี ที่ล็อต ${fmt(qn, 0)} ชิ้น ` +
      (p.breakEven === null ? 'และไม่มีราคาใดที่คุ้มที่ล็อตนี้' : `ต้องได้ราคาไม่เกิน ${baht(p.breakEven, 3)} จึงคุ้ม`);
}

function renderTable(v) {
  const { results, best, proposal: p, qn, pn } = v;
  const tcBest = best.cost.total;
  const cell = c => (c === null ? '—' : baht(c));
  const diff = d => (Math.abs(d) < 0.005 ? '—' : `<span class="${d > 0 ? 'neg' : 'pos'}">${d > 0 ? '+' : '−'}${baht(Math.abs(d))}</span>`);
  const rows = results.map(r => {
    const range = r.maxQty === Infinity ? `${fmt(r.minQty, 0)} ขึ้นไป` : `${fmt(r.minQty, 0)}–${fmt(r.maxQty, 0)}`;
    const isBest = r === best;
    const c = r.cost;
    return `<tr class="${isBest ? 'best' : ''} ${r.status === 'discarded' ? 'discarded' : ''}">
      <td><span class="tier-tag"><span class="swatch" style="background:${tierColor(r.index)}"></span>ช่วง ${r.index + 1} (${range})</span></td>
      <td>${baht(r.price)}</td>
      <td>${r.qty === null ? `— <small>(Q* ${fmt(r.qStar, 0)})</small>` : fmt(r.qty, 0)}${r.status === 'adjusted' ? ` <small>(Q* ${fmt(r.qStar, 0)})</small>` : ''}</td>
      <td>${cell(c && c.product)}</td><td>${cell(c && c.ordering)}</td><td>${cell(c && c.holding)}</td>
      <td>${cell(c && c.total)}</td>
      <td>${c ? diff(c.total - tcBest) : '—'}</td>
      <td>${isBest ? '<span class="badge best">ดีที่สุดของร้าน</span>' : `<span class="badge">${STATUS[r.status]}</span>`}</td>
    </tr>`;
  });
  const good = p.saving >= 0;
  rows.push(`<tr class="proposal">
    <td><span class="tier-tag"><span class="swatch" style="background:var(--proposal)"></span>ข้อเสนอต่อรอง</span></td>
    <td>${baht(pn)}</td><td>${fmt(qn, 0)}</td>
    <td>${baht(p.cost.product)}</td><td>${baht(p.cost.ordering)}</td><td>${baht(p.cost.holding)}</td>
    <td>${baht(p.cost.total)}</td><td>${diff(-p.saving)}</td>
    <td><span class="badge ${good ? 'good' : 'bad'}">${good ? '✓ ได้ประโยชน์' : '✗ แพงกว่าเดิม'}</span></td>
  </tr>`);
  $('compare-rows').innerHTML = rows.join('');
}

function syncProposalRanges(v) {
  const qnRange = $('qn-range');
  qnRange.max = String(qMax(v.tiers, v.results, v.qn));
  const prices = v.tiers.map(t => t.price);
  const pnRange = $('pn-range');
  pnRange.min = String(Math.floor(Math.min(...prices) * 0.8 * 100) / 100);
  pnRange.max = String(Math.max(...prices));
}

// Hook for charts (Task 5).
let drawCharts = () => {};
export function setChartRenderer(fn) { drawCharts = fn; }

function render() {
  const { ok, errors } = validate(state);
  showErrors(errors);
  if (!ok) return; // keep last good results on screen

  view = computeView(state);
  syncD(state.D); syncS(state.S); syncI(state.I);
  syncProposalRanges(view);
  syncQn(view.qn); syncPn(view.pn);

  const b = view.best;
  $('c1-sub').textContent = `ในตารางของร้าน ดีที่สุดคือสั่งครั้งละ ${fmt(b.qty, 0)} ชิ้นที่ ${baht(b.price)}: TC ${baht(b.cost.total)}/ปี`;
  renderProposal(view);
  renderTable(view);
  drawCharts(view);
  history.replaceState(null, '', '#' + encodeState(state));
}

// ---------- header actions ----------
$('reset').addEventListener('click', () => {
  state = structuredClone(DEFAULT_STATE);
  buildTierRows();
  render();
});
$('suggest').addEventListener('click', () => setState({ qn: null, pn: null }));
$('copy-link').addEventListener('click', async () => {
  const btn = $('copy-link');
  try {
    await navigator.clipboard.writeText(location.href);
    btn.textContent = 'คัดลอกแล้ว';
  } catch {
    btn.textContent = 'คัดลอกไม่ได้';
  }
  setTimeout(() => (btn.textContent = 'คัดลอกลิงก์'), 2000);
});

buildTierRows();
render();
