// App state, validation and URL-hash encoding. Pure functions, no DOM.
// State = { D, S, I, tiers: [{ minQty, price }], qn, pn }  (qn/pn null = use suggestion)

export const MAX_TIERS = 6;

export const DEFAULT_STATE = Object.freeze({
  D: 5000,
  S: 49,
  I: 0.2,
  tiers: Object.freeze([
    Object.freeze({ minQty: 0, price: 5 }),
    Object.freeze({ minQty: 1000, price: 4.8 }),
    Object.freeze({ minQty: 2000, price: 4.75 }),
  ]),
  qn: null,
  pn: null,
});

const isPositive = v => Number.isFinite(v) && v > 0;
const POSITIVE = 'ต้องเป็นตัวเลขที่มากกว่า 0';

export function validate(state) {
  const errors = {};
  if (!isPositive(state.D)) errors.D = POSITIVE;
  if (!isPositive(state.S)) errors.S = POSITIVE;
  if (!isPositive(state.I)) errors.I = POSITIVE;
  if (state.qn !== null && !(Number.isInteger(state.qn) && state.qn >= 1)) errors.qn = 'ต้องเป็นจำนวนเต็มตั้งแต่ 1';
  if (state.pn !== null && !isPositive(state.pn)) errors.pn = POSITIVE;

  const tiers = state.tiers;
  if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > MAX_TIERS) {
    errors.tierCount = `ตารางส่วนลดต้องมี 1 ถึง ${MAX_TIERS} ช่วง`;
  } else {
    const rows = tiers.map((t, i) => {
      const e = {};
      if (i === 0 && t.minQty !== 0) e.minQty = 'ช่วงแรกต้องเริ่มที่ 0';
      else if (!(Number.isInteger(t.minQty) && t.minQty >= 0)) e.minQty = 'ต้องเป็นจำนวนเต็มไม่ติดลบ';
      else if (i > 0 && !(t.minQty > tiers[i - 1].minQty)) e.minQty = 'ต้องมากกว่าปริมาณขั้นต่ำของช่วงก่อนหน้า';
      if (!isPositive(t.price)) e.price = POSITIVE;
      return Object.keys(e).length ? e : null;
    });
    if (rows.some(Boolean)) errors.tiers = rows;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

const num = v => +(+v).toFixed(4); // trims float noise such as 25.500000000000004

export function encodeState(s) {
  const p = new URLSearchParams();
  p.set('d', num(s.D));
  p.set('s', num(s.S));
  p.set('i', num(s.I * 100));
  p.set('t', s.tiers.map(t => `${num(t.minQty)}:${num(t.price)}`).join(','));
  if (s.qn !== null) p.set('q', s.qn);
  if (s.pn !== null) p.set('p', num(s.pn));
  return p.toString().replace(/%3A/gi, ':').replace(/%2C/gi, ',');
}

// Each field falls back to its default on its own when missing or invalid.
export function decodeState(hash) {
  const p = new URLSearchParams(String(hash).replace(/^#/, ''));
  const state = structuredClone(DEFAULT_STATE);
  const toNum = v => (v === null || v.trim() === '' ? NaN : Number(v));
  const fields = {
    D: () => toNum(p.get('d')),
    S: () => toNum(p.get('s')),
    I: () => toNum(p.get('i')) / 100,
    qn: () => toNum(p.get('q')),
    pn: () => toNum(p.get('p')),
    tiers: () => p.get('t').split(',').map(pair => {
      const [m, pr] = pair.split(':');
      return { minQty: toNum(m ?? null), price: toNum(pr ?? null) };
    }),
  };
  const keyOf = { D: 'd', S: 's', I: 'i', qn: 'q', pn: 'p', tiers: 't' };
  for (const [field, read] of Object.entries(fields)) {
    if (!p.has(keyOf[field])) continue;
    const candidate = { ...state, [field]: read() };
    const { errors } = validate(candidate);
    const bad = field === 'tiers' ? errors.tiers || errors.tierCount : errors[field];
    if (!bad) state[field] = candidate[field];
  }
  return state;
}
