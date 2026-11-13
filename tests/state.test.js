import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, MAX_TIERS, validate, encodeState, decodeState } from '../js/state.js';

const clone = () => structuredClone(DEFAULT_STATE);

test('ค่าเริ่มต้นผ่านการตรวจ', () => assert.equal(validate(DEFAULT_STATE).ok, true));

test('encode ค่าเริ่มต้น', () =>
  assert.equal(encodeState(DEFAULT_STATE), 'd=5000&s=49&i=20&t=0:5,1000:4.8,2000:4.75'));

test('encode แล้ว decode ได้ค่าเดิม', () => {
  const s = { ...clone(), D: 4750, I: 0.255, qn: 714, pn: 4.8 };
  assert.deepEqual(decodeState('#' + encodeState(s)), s);
});

test('hash ว่างให้ค่าเริ่มต้น', () => assert.deepEqual(decodeState(''), clone()));

test('field ที่ผิดใช้ค่าเริ่มต้นเฉพาะ field นั้น', () => {
  const s = decodeState('d=-5&s=60&i=abc&t=abc&q=0&p=4.9');
  assert.deepEqual(s, { ...clone(), S: 60, pn: 4.9 });
});

test('ตารางเกิน MAX_TIERS ใช้ตารางเริ่มต้น', () => {
  const t = Array.from({ length: MAX_TIERS + 1 }, (_, i) => `${i * 100}:5`).join(',');
  assert.deepEqual(decodeState(`t=${t}`).tiers, clone().tiers);
});

test('validate ปฏิเสธค่าที่ไม่เป็นบวกและ NaN', () => {
  for (const bad of [0, -1, NaN, Infinity]) {
    assert.ok(validate({ ...clone(), D: bad }).errors.D);
    assert.ok(validate({ ...clone(), S: bad }).errors.S);
    assert.ok(validate({ ...clone(), I: bad }).errors.I);
  }
});

test('validate ปฏิเสธ minQty ที่ซ้ำ ไม่เรียง หรือไม่เป็นจำนวนเต็ม', () => {
  for (const mins of [[0, 1000, 1000], [0, 2000, 1000], [0, 10.5, 2000], [5, 1000, 2000]]) {
    const s = clone(); mins.forEach((m, i) => (s.tiers[i].minQty = m));
    const r = validate(s);
    assert.equal(r.ok, false); assert.ok(r.errors.tiers.some(e => e && e.minQty));
  }
});

test('validate ชี้ราคาที่ผิดตามแถว', () => {
  const s = clone(); s.tiers[1].price = 0;
  const r = validate(s);
  assert.equal(r.errors.tiers[0], null); assert.ok(r.errors.tiers[1].price);
});
