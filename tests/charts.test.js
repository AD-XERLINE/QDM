import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qMax, linearScale, tcYDomain } from '../js/charts.js';
import { evaluateTiers, bestOffer, evaluateProposal } from '../js/model.js';

const BEE = { D: 5000, S: 49, I: 0.2 };
const TIERS = [{ minQty: 0, price: 5 }, { minQty: 1000, price: 4.8 }, { minQty: 2000, price: 4.75 }];
const results = evaluateTiers(BEE, TIERS);
const best = bestOffer(results);

test('qMax ครอบคลุมช่วงราคาสุดท้ายและ Qn', () => {
  assert.equal(qMax(TIERS, results, 714), 2500);
  assert.equal(qMax(TIERS, results, 5000), 6000);
  assert.equal(qMax([{ minQty: 0, price: 60 }], [{ qStar: 345 }], 345), 1100);
});

test('linearScale แปลงไปและกลับ', () => {
  const s = linearScale([1, 2500], [60, 780]);
  assert.equal(s.to(1), 60); assert.equal(s.to(2500), 780);
  assert.ok(Math.abs(s.from(s.to(714)) - 714) < 1e-9);
});

test('tcYDomain ล้อมจุดสำคัญและไม่เริ่มจาก 0', () => {
  const view = { params: BEE, tiers: TIERS, results, best, qn: 714, pn: 4.8,
                 proposal: evaluateProposal(714, 4.8, BEE, best) };
  const [lo, hi] = tcYDomain(view, 2500);
  assert.ok(lo > 20000 && lo < 24685.86);
  assert.ok(hi > 25700);
});

test('tcYDomain ช่วงราคาเดียว: แกนไม่ซูมตามข้อเสนอ จุดจึงขยับได้', () => {
  const tiers = [{ minQty: 0, price: 5 }];
  const params = { D: 5000, S: 49, I: 0.11 };
  const res = evaluateTiers(params, tiers);
  const b = bestOffer(res);
  const dom = qn => tcYDomain({ params, tiers, results: res, best: b, qn, pn: 5,
    proposal: evaluateProposal(qn, 5, params, b) }, 3000);
  assert.deepEqual(dom(780), dom(1406));
  const [lo, hi] = dom(941);
  assert.ok(hi - lo > 100);
});
