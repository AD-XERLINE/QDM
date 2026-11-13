import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tc, eoq, evaluateTiers, bestOffer, breakEvenPrice, suggestProposal, evaluateProposal } from '../js/model.js';

const near = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const BEE = { D: 5000, S: 49, I: 0.2 };
const BEE_TIERS = [{ minQty: 0, price: 5 }, { minQty: 1000, price: 4.8 }, { minQty: 2000, price: 4.75 }];

test('tc แยกส่วนประกอบ', () => {
  const c = tc(1000, 4.8, BEE);
  near(c.product, 24000); near(c.ordering, 245); near(c.holding, 480); near(c.total, 24725);
  assert.deepEqual(Object.keys(c), ['product', 'ordering', 'holding', 'total']);
});

test('eoq ตามสไลด์ 50', () => {
  near(eoq(5, BEE), 700); near(eoq(4.8, BEE), 714.43, 0.01); near(eoq(4.75, BEE), 718.18, 0.01);
});

test('evaluateTiers ตรงกับสไลด์ 51-52', () => {
  const r = evaluateTiers(BEE, BEE_TIERS);
  assert.deepEqual(r.map(t => [t.qStar, t.qty, t.status]),
    [[700, 700, 'feasible'], [714, 1000, 'adjusted'], [718, 2000, 'adjusted']]);
  assert.deepEqual(r.map(t => t.maxQty), [999, 1999, Infinity]);
  near(r[0].cost.total, 25700); near(r[1].cost.total, 24725); near(r[2].cost.total, 24822.5);
  assert.equal(bestOffer(r).index, 1);
});

test('ช่วงเดียวจากรูป EOQ', () => {
  const p = { D: 4750, S: 150, I: 0.2 };
  const [t] = evaluateTiers(p, [{ minQty: 0, price: 60 }]);
  assert.equal(t.qStar, 345); assert.equal(t.status, 'feasible');
  near(t.cost.ordering, 2065.22, 0.01); near(t.cost.holding, 2070);
});

test('Q* สูงกว่าขอบบนถูกตัดทิ้งและไม่ถูกเลือก', () => {
  const r = evaluateTiers(BEE, [{ minQty: 0, price: 5 }, { minQty: 500, price: 4.8 }]);
  assert.equal(r[0].status, 'discarded'); assert.equal(r[0].cost, null);
  assert.equal(r[1].status, 'feasible'); assert.equal(bestOffer(r).index, 1);
});

test('Q* บนขอบของช่วงพอดีเป็น feasible', () => {
  const lower = evaluateTiers(BEE, [{ minQty: 0, price: 5 }, { minQty: 714, price: 4.8 }]);
  assert.equal(lower[1].status, 'feasible'); assert.equal(lower[1].qty, 714);
  const upper = evaluateTiers(BEE, [{ minQty: 0, price: 5 }, { minQty: 701, price: 4.8 }]);
  assert.equal(upper[0].status, 'feasible'); assert.equal(upper[0].qty, 700);
});

test('ราคาไม่ลดตามปริมาณก็ยังเลือก TC ต่ำสุด', () => {
  const r = evaluateTiers(BEE, [{ minQty: 0, price: 4.8 }, { minQty: 1000, price: 5 }]);
  assert.equal(bestOffer(r).index, 0);
});

test('ราคาเท่าทุน', () => {
  near(breakEvenPrice(700, 24725, BEE), 4.8077, 0.0001);
  near(breakEvenPrice(1000, 24725, BEE), 4.8, 1e-9);
  near(breakEvenPrice(2000, 24725, BEE), 4.7312, 0.0001);
});

test('ค่าแนะนำ = ราคาของข้อเสนอที่ดีที่สุด และ EOQ ที่ราคานั้น', () => {
  const best = bestOffer(evaluateTiers(BEE, BEE_TIERS));
  assert.deepEqual(suggestProposal(BEE, best), { qn: 714, pn: 4.8 });
});

test('ข้อเสนอต่อรอง (714, 4.80)', () => {
  const best = bestOffer(evaluateTiers(BEE, BEE_TIERS));
  const r = evaluateProposal(714, 4.8, BEE, best);
  near(r.cost.total, 24685.86); near(r.saving, 39.14);
  near(r.ordersPerYear, 7.003, 0.001); near(r.daysBetweenOrders, 52.12, 0.01);
  assert.equal(r.avgInventory, 357); assert.equal(r.bestAvgInventory, 500);
  near(r.breakEven, 4.8077, 0.0001);
});

test('ข้อเสนอที่แพงกว่าเดิมให้ saving ติดลบ', () => {
  const best = bestOffer(evaluateTiers(BEE, BEE_TIERS));
  assert.ok(evaluateProposal(2000, 4.75, BEE, best).saving < 0);
});

test('ล็อตเล็กจนไม่มีราคาที่คุ้มให้ breakEven เป็น null', () => {
  const best = bestOffer(evaluateTiers(BEE, BEE_TIERS));
  assert.equal(evaluateProposal(1, 4.8, BEE, best).breakEven, null);
});
