# QDM Negotiator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web app หน้าเดียวที่คำนวณ EOQ/QDM และหาข้อเสนอต่อรองราคา (ล็อต, ราคา) ที่ทำให้ TC ต่ำกว่าข้อเสนอที่ดีที่สุดของร้าน โดยปรับ input ได้ทุกตัวและกราฟเปลี่ยนทันที

**Architecture:** ไฟล์ static ไม่มี build สูตรคำนวณอยู่ใน pure functions (`js/model.js`, `js/state.js`) ที่ทดสอบด้วย `node --test` ส่วน `js/charts.js` วาด SVG จากผลคำนวณ และ `js/app.js` ผูก input, state, URL hash และสั่งวาดใหม่ ทิศทางข้อมูล: input → state → model → แสดงผล → URL

**Tech Stack:** HTML, CSS, JavaScript (ES modules), SVG, Node 26 (`node:test`) สำหรับทดสอบ, GitHub Pages ไม่มี dependency

**Spec:** `docs/superpowers/specs/2026-11-14-qdm-negotiator-design.md`

## Global Constraints

- ไม่มี dependency และไม่มีขั้นตอน build ห้ามเพิ่มแพ็กเกจใน `package.json`
- ภาษาบนหน้าจอเป็นไทย คงศัพท์วิชาเป็นอังกฤษ: EOQ, TC, Ordering cost, Holding cost
- ธีมพื้นสว่าง ฟอนต์ `"IBM Plex Sans Thai"` จาก Google Fonts และ fallback `system-ui, "Leelawadee UI", sans-serif` ตัวเลขใช้ `font-variant-numeric: tabular-nums`
- ขนาดตัวอักษรพื้นฐาน 17px ตัวเลขผลลัพธ์หลัก 30px
- สูตร: `TC(Q,P) = D·P + (D/Q)·S + (Q/2)·I·P`, `Q*(P) = √(2DS/(I·P))`, `P_be(Q) = (TC_best − (D/Q)·S) / (D + Q·I/2)`
- `Q*` ปัดเป็นจำนวนเต็มที่ใกล้ที่สุดก่อนตรวจช่วงและก่อนคำนวณ TC
- ตารางส่วนลด: ช่วงแรก `minQty = 0` เสมอ ไม่เกิน 6 ช่วง
- รูปแบบตัวเลข: เงินในตารางทศนิยม 2 ตำแหน่ง, เงินในการ์ดผลลัพธ์และประโยคสรุปไม่มีทศนิยม, ราคาต่อหน่วย 2 ตำแหน่ง, ราคาเท่าทุน 3 ตำแหน่ง, คั่นหลักพันด้วยจุลภาค, นำหน้าด้วย `฿`
- ใช้ 365 วันต่อปี
- สถานะได้ประโยชน์หรือแพงกว่าเดิมต้องบอกด้วยข้อความ ไม่ใช้สีอย่างเดียว contrast ระดับ AA
- ทำงานบน branch `feat/qdm-negotiator` การ merge เข้า `main`, push และเปิด GitHub Pages ต้องให้ผู้ใช้ยืนยันก่อน

## Review Focus

1. ช่องตัวเลขระหว่างพิมพ์ (ว่าง, `4.`, `-`): หน้าจอต้องไม่แสดง `NaN` และคงผลลัพธ์ล่าสุดที่ถูกต้อง — ทดสอบใน Task 3 (`validate` ปฏิเสธ `NaN`) และตรวจด้วยมือใน Task 4
2. `Qn` เล็กมากจน `P_be(Qn) ≤ 0`: ต้องแสดง "ไม่มีราคาที่คุ้มที่ล็อตนี้" ไม่ใช่ราคาติดลบ — ทดสอบใน Task 2
3. URL hash ที่ถูกแก้หรือผิดรูปแบบ (`t=abc`, `d=-5`, เกิน 6 ช่วง): ต้องได้ค่าเริ่มต้นของค่านั้น ไม่ใช่หน้าจอพัง — ทดสอบใน Task 3
4. `Q*` ตกบนขอบของช่วงพอดี (เท่ากับ `minQty` หรือขอบบน): ต้องเป็น `feasible` — ทดสอบใน Task 1
5. ตารางที่ช่วงปริมาณสูงกว่ามีราคาแพงกว่า: ต้องยังเลือกช่วงที่ TC ต่ำสุดได้ถูก — ทดสอบใน Task 1

---

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `package.json` | `{"type":"module","private":true,"scripts":{"test":"node --test"}}` |
| `js/model.js` | สูตร EOQ, QDM, ราคาเท่าทุน, ข้อเสนอต่อรอง (pure) |
| `js/state.js` | ค่าเริ่มต้น, การตรวจค่า, แปลง state ↔ hash (pure) |
| `js/charts.js` | วาดกราฟ SVG 2 รูป และการลากจุด |
| `js/app.js` | ผูก DOM, state, URL และสั่งวาดใหม่ |
| `index.html`, `styles.css` | โครงหน้าจอและรูปแบบ |
| `tests/model.test.js`, `tests/state.test.js`, `tests/charts.test.js` | ชุดทดสอบ |
| `.claude/launch.json` | static server สำหรับเปิดดูในเครื่อง |

ชนิดข้อมูลที่ใช้ร่วมกันทุก task:

```js
// Params = { D: number, S: number, I: number }          I เป็นสัดส่วน เช่น 0.2
// Tier   = { minQty: number, price: number }
// Cost   = { product: number, ordering: number, holding: number, total: number }
// TierResult = { index: number, minQty: number, maxQty: number /* Infinity ที่ช่วงสุดท้าย */,
//                price: number, qStar: number /* ปัดแล้ว */, qty: number,
//                status: 'feasible' | 'adjusted' | 'discarded', cost: Cost | null /* null เมื่อ discarded */ }
// State  = { D, S, I, tiers: Tier[], qn: number | null, pn: number | null }   null = ใช้ค่าแนะนำ
```

---

### Task 1: โมเดล EOQ และ QDM

**Files:**
- Create: `package.json`, `js/model.js`
- Test: `tests/model.test.js`

**Interfaces:**
- Produces:
  - `tc(Q: number, P: number, params: Params): Cost`
  - `eoq(P: number, params: Params): number` (ไม่ปัด)
  - `evaluateTiers(params: Params, tiers: Tier[]): TierResult[]`
  - `bestOffer(results: TierResult[]): TierResult` (TC ต่ำสุดในช่วงที่ไม่ `discarded`)

- [ ] **Step 1: สร้าง branch และ `package.json`**

```bash
git checkout -b feat/qdm-negotiator
```

`package.json` ตามตาราง File Structure

- [ ] **Step 2: เขียนชุดทดสอบที่ยังไม่ผ่าน**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tc, eoq, evaluateTiers, bestOffer } from '../js/model.js';

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
```

- [ ] **Step 3: รันให้เห็นว่าไม่ผ่าน**

Run: `node --test tests/model.test.js`
Expected: FAIL เพราะหา `../js/model.js` ไม่เจอ

- [ ] **Step 4: เขียน `tc`, `eoq`, `evaluateTiers`, `bestOffer` ใน `js/model.js`**

ขอบล่างที่ใช้ตรวจของช่วงแรกคือ 1 (สั่ง 0 ชิ้นไม่ได้) `qStar` ปัดด้วย `Math.round` และไม่ต่ำกว่า 1

- [ ] **Step 5: รันให้ผ่าน**

Run: `node --test tests/model.test.js`
Expected: PASS ทั้ง 7 test

- [ ] **Step 6: Commit**

```bash
git add package.json js/model.js tests/model.test.js
git commit -m "feat: add EOQ and quantity discount model"
```

---

### Task 2: ราคาเท่าทุนและข้อเสนอต่อรอง

**Files:**
- Modify: `js/model.js`
- Test: `tests/model.test.js`

**Interfaces:**
- Consumes: `tc`, `eoq`, `TierResult` จาก Task 1
- Produces:
  - `breakEvenPrice(Q: number, tcBest: number, params: Params): number` (ค่าอาจเป็น 0 หรือติดลบ ผู้เรียกตีความเอง)
  - `suggestProposal(params: Params, best: TierResult): { qn: number, pn: number }`
  - `evaluateProposal(qn: number, pn: number, params: Params, best: TierResult): { cost: Cost, saving: number, ordersPerYear: number, daysBetweenOrders: number, avgInventory: number, bestAvgInventory: number, breakEven: number | null }` (`breakEven` เป็น `null` เมื่อ `P_be ≤ 0`)

- [ ] **Step 1: เพิ่ม test ที่ยังไม่ผ่าน**

```js
import { breakEvenPrice, suggestProposal, evaluateProposal } from '../js/model.js';

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
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `node --test tests/model.test.js`
Expected: FAIL เพราะ `breakEvenPrice` ยังไม่ถูก export

- [ ] **Step 3: เขียน 3 ฟังก์ชันใน `js/model.js` ตาม Interfaces**

- [ ] **Step 4: รันให้ผ่าน**

Run: `node --test tests/model.test.js`
Expected: PASS ทั้ง 12 test

- [ ] **Step 5: Commit**

```bash
git add js/model.js tests/model.test.js
git commit -m "feat: add break-even price and negotiation proposal"
```

---

### Task 3: State, การตรวจค่า และ URL hash

**Files:**
- Create: `js/state.js`
- Test: `tests/state.test.js`

**Interfaces:**
- Produces:
  - `MAX_TIERS = 6`
  - `DEFAULT_STATE: State` = `{ D: 5000, S: 49, I: 0.2, tiers: [{minQty:0,price:5},{minQty:1000,price:4.8},{minQty:2000,price:4.75}], qn: null, pn: null }` (frozen ผู้ใช้ต้อง clone ก่อนแก้)
  - `validate(state: State): { ok: boolean, errors: { D?: string, S?: string, I?: string, qn?: string, pn?: string, tiers?: Array<{ minQty?: string, price?: string } | null> } }`
  - `encodeState(state: State): string` (ไม่มี `#` นำหน้า)
  - `decodeState(hash: string): State` (รับได้ทั้งมีและไม่มี `#`)

กฎของ `validate`: `D`, `S`, `I`, ราคา ต้องเป็นจำนวนจำกัดที่มากกว่า 0, `minQty` ต้องเป็นจำนวนเต็มไม่ติดลบ ช่วงแรกเป็น 0 และเรียงจากน้อยไปมากโดยไม่ซ้ำ, จำนวนช่วง 1 ถึง `MAX_TIERS`, `qn` (ถ้าไม่ `null`) เป็นจำนวนเต็มตั้งแต่ 1, `pn` (ถ้าไม่ `null`) มากกว่า 0 ข้อความ error เป็นภาษาไทย

รูปแบบ hash: `d=5000&s=49&i=20&t=0:5,1000:4.8,2000:4.75&q=714&p=4.8` โดย `i` เป็นเปอร์เซ็นต์ที่ปัด 4 ตำแหน่งด้วย `+(I * 100).toFixed(4)` เพื่อกันเศษทศนิยมของ float และไม่ใส่ `q`, `p` เมื่อเป็น `null`
`decodeState` ใช้ค่าเริ่มต้นแทนทีละ field ที่อ่านไม่ได้หรือไม่ผ่าน `validate` (ตาราง `t` นับเป็น field เดียว)

- [ ] **Step 1: เขียนชุดทดสอบที่ยังไม่ผ่าน**

```js
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
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `node --test tests/state.test.js`
Expected: FAIL เพราะหา `../js/state.js` ไม่เจอ

- [ ] **Step 3: เขียน `js/state.js` ตาม Interfaces**

ใช้ `URLSearchParams` อ่านและเขียน hash

- [ ] **Step 4: รันให้ผ่าน**

Run: `node --test`
Expected: PASS ทั้ง 21 test (12 จาก model, 9 จาก state)

- [ ] **Step 5: Commit**

```bash
git add js/state.js tests/state.test.js
git commit -m "feat: add state validation and URL hash encoding"
```

---

### Task 4: หน้าจอ input, ผลลัพธ์ และตารางเปรียบเทียบ (ยังไม่มีกราฟ)

**Files:**
- Create: `index.html`, `styles.css`, `js/app.js`, `.claude/launch.json`

**Interfaces:**
- Consumes: ทุกฟังก์ชันจาก Task 1–3
- Produces (ใน `js/app.js` สำหรับ Task 5):
  - `computeView(state: State): View` โดย `View = { params: Params, tiers: Tier[], results: TierResult[], best: TierResult, qn: number, pn: number, proposal: ReturnType<typeof evaluateProposal> }` (`qn`, `pn` ที่เป็น `null` ใน state ถูกแทนด้วย `suggestProposal`)
  - `setProposalQty(qn: number): void` อัปเดต state แล้วสั่งวาดใหม่
  - `<svg id="tc-chart">` และ `<svg id="price-chart">` ว่าง ๆ ใน `index.html` ในการ์ด ① และ ②

โครง `index.html` ตามหัวข้อ 5 ของ spec: ส่วนหัว (ชื่อ "QDM Negotiator", ปุ่ม "คัดลอกลิงก์", ปุ่ม "รีเซ็ต"), แผงซ้าย "สมมติฐาน", การ์ด ① ② ③, ตาราง ④

ค่าที่กำหนด:
- slider: `D` 100–20,000 step 50, `S` 1–500 step 1, `I` 1–50% step 0.5, `Qn` 1–`qMax` step 1, `Pn` จาก 80% ของราคาต่ำสุดในตารางถึงราคาสูงสุด step 0.01
- `qMax` ใน task นี้ใช้ `Math.max(1.25 × minQty ช่วงสุดท้าย, 3 × qStar สูงสุด)` ปัดขึ้นเป็นหลักร้อย (Task 5 ย้ายไปใช้ `qMax` จาก `charts.js`)
- พิมพ์ค่าเกิน max ของ slider: ตั้ง max ของ slider เป็น 2 เท่าของค่าที่พิมพ์
- Layout: CSS grid แผงซ้ายกว้าง 320px แบบ `position: sticky` จอกว้างต่ำกว่า 900px เรียงคอลัมน์เดียว
- ปุ่ม "เพิ่มช่วง": เพิ่มแถวที่ `minQty` = `minQty` ช่วงสุดท้าย + 1,000 และราคา = ราคาช่วงสุดท้าย × 0.99 ปัด 2 ตำแหน่ง ปิดปุ่มเมื่อครบ `MAX_TIERS`
- การ์ด ③ แสดง: TC ใหม่, เงินที่ประหยัดต่อปี, จำนวนครั้งที่สั่งต่อปี (ทศนิยม 1 ตำแหน่ง) และ "ทุก N วัน", สต็อกเฉลี่ยเทียบกับของร้าน, ราคาเท่าทุนที่ล็อตนี้ หรือ "ไม่มีราคาที่คุ้มที่ล็อตนี้" เมื่อ `breakEven` เป็น `null`
- ประโยคสรุปเมื่อ `saving ≥ 0`: `ขอราคา ฿{pn} ที่ล็อต {qn} ชิ้น โดยสัญญาซื้อรวม {D} ชิ้น/ปี: TC ลดจาก ฿{TC_best} เหลือ ฿{TC_n} (ประหยัด ฿{saving}/ปี) และสต็อกเฉลี่ยเปลี่ยนจาก {bestAvgInventory} เป็น {avgInventory} ชิ้น`
- ประโยคสรุปเมื่อ `saving < 0`: `ข้อเสนอนี้แพงกว่าข้อเสนอของร้าน ฿{-saving}/ปี ที่ล็อต {qn} ชิ้น ต้องได้ราคาไม่เกิน ฿{breakEven} จึงคุ้ม`
- ตาราง ④: คอลัมน์ ช่วง, ราคา, Q, ค่าสินค้า, Ordering cost, Holding cost, TC, ส่วนต่างจาก TC ที่ดีที่สุด, สถานะ ("ใช้ได้", "ปรับขึ้น", "ตัดทิ้ง") แถวที่ดีที่สุดมีป้าย "ดีที่สุดของร้าน" แถวสุดท้ายคือ "ข้อเสนอต่อรอง"
- เมื่อ `validate` ไม่ผ่าน: แสดงข้อความ error ใต้ช่องนั้นพร้อม `aria-describedby` ไม่คำนวณใหม่ ไม่เขียน URL และคงผลลัพธ์ล่าสุดไว้
- URL: เขียนด้วย `history.replaceState(null, '', '#' + encodeState(state))` ทุกครั้งที่ state ถูกต้องเปลี่ยน และอ่านด้วย `decodeState(location.hash)` ตอนโหลด
- "รีเซ็ต": state = clone ของ `DEFAULT_STATE`; "ใช้ค่าแนะนำ": `qn = pn = null`; "คัดลอกลิงก์": `navigator.clipboard.writeText(location.href)` แล้วเปลี่ยนข้อความปุ่มเป็น "คัดลอกแล้ว" 2 วินาที
- บริเวณผลลัพธ์ของการ์ด ③ เป็น `aria-live="polite"`

`.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "qdm", "runtimeExecutable": "python", "runtimeArgs": ["-m", "http.server", "8765"], "port": 8765 }
  ]
}
```

- [ ] **Step 1: เขียน `index.html` และ `styles.css`** ตามโครงและค่าที่กำหนด

- [ ] **Step 2: เขียน `js/app.js`**: `computeView`, การผูก input สองทาง, การแสดงการ์ด ③ และตาราง ④, URL, ปุ่มทั้ง 4

- [ ] **Step 3: รันชุดทดสอบเดิม**

Run: `node --test`
Expected: PASS ทั้ง 21 test

- [ ] **Step 4: ตรวจในเบราว์เซอร์**

เปิด server ชื่อ `qdm` แล้วตรวจทีละข้อ:
- ค่าเริ่มต้น: ตาราง ④ แสดง TC 25,700.00 / 24,725.00 / 24,822.50 และแถว 2 มีป้าย "ดีที่สุดของร้าน"
- การ์ด ③ แสดงล็อต 714, ราคา 4.80, TC ใหม่ ฿24,686, ประหยัด ฿39, ราคาเท่าทุน ฿4.808
- เลื่อน `Qn` ไป 2,000 และ `Pn` ไป 4.75: ประโยคสรุปเปลี่ยนเป็นแบบ "แพงกว่า" และบอกราคาไม่เกิน ฿4.731
- ลบค่าในช่อง `D` ให้ว่าง: มีข้อความเตือนใต้ช่อง ผลลัพธ์เดิมยังอยู่ ไม่มี `NaN` บนจอ
- แก้ `minQty` แถว 3 เป็น 500: มีข้อความเตือนที่แถวนั้น
- คัดลอกลิงก์แล้วเปิดในแท็บใหม่: ได้ค่าเดิมทุกช่อง
- กด "รีเซ็ต": กลับเป็นโจทย์ Bee Beauty
- console ของเบราว์เซอร์ไม่มี error
- ย่อหน้าต่างให้แคบกว่า 900px: เรียงคอลัมน์เดียว ไม่มี scroll แนวนอน

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css js/app.js .claude/launch.json
git commit -m "feat: add inputs, negotiation results and comparison table"
```

---

### Task 5: กราฟ TC และกราฟราคาเท่าทุน

**Files:**
- Create: `js/charts.js`
- Modify: `js/app.js` (เรียกวาดกราฟใน render และใช้ `qMax` จาก `charts.js`)
- Test: `tests/charts.test.js`

**Interfaces:**
- Consumes: `View`, `setProposalQty` จาก Task 4; `tc`, `breakEvenPrice` จาก Task 1–2
- Produces:
  - `qMax(tiers: Tier[], results: TierResult[], qn: number): number` = `max(1.25 × minQty ช่วงสุดท้าย, 3 × qStar สูงสุด, 1.2 × qn)` ปัดขึ้นเป็นหลักร้อย
  - `linearScale(domain: [number, number], range: [number, number]): { to(v: number): number, from(px: number): number }`
  - `tcYDomain(view: View, xMax: number): [number, number]` = `[min − 0.15·span, TC_best + 3·span]` โดย `min` คือค่าต่ำสุดของ `TC_best` และ `proposal.cost.total` และ `span = max(TC ของช่วงที่ไม่ discarded, proposal) − min` (ถ้า `span` เป็น 0 ใช้ 1% ของ `min`)
  - `renderTcChart(svg: SVGSVGElement, view: View, onDragQ: (qn: number) => void): void`
  - `renderPriceChart(svg: SVGSVGElement, view: View): void`

ทั้งสองกราฟใช้ `viewBox="0 0 800 360"` และแกนนอน `[1, qMax]` ร่วมกัน

- [ ] **Step 1: เขียน test ของฟังก์ชัน pure ที่ยังไม่ผ่าน**

```js
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
```

- [ ] **Step 2: รันให้เห็นว่าไม่ผ่าน**

Run: `node --test tests/charts.test.js`
Expected: FAIL เพราะหา `../js/charts.js` ไม่เจอ

- [ ] **Step 3: เขียน `qMax`, `linearScale`, `tcYDomain`**

`js/charts.js` ต้องไม่แตะ `document` ที่ระดับบนสุดของ module เพื่อให้ import ใน Node ได้

- [ ] **Step 4: รันให้ผ่าน**

Run: `node --test`
Expected: PASS ทั้ง 24 test

- [ ] **Step 5: เขียน `renderTcChart`**

- เส้นของแต่ละช่วงราคา: เส้นทึบหนา 3px ในช่วง `[minQty, maxQty]` และเส้นประจาง (opacity 0.35) นอกช่วง สุ่มค่าทุก 1/200 ของแกนนอน ตัดส่วนที่เกินขอบบนของแกนตั้งด้วย `clipPath`
- เส้นตั้งประที่แต่ละ `minQty` (ยกเว้น 0) พร้อมป้ายปริมาณ
- จุดกลวงที่ `qStar` ของช่วงที่ `adjusted` หรือ `discarded`, จุดทึบที่ `qty` ของช่วงที่ไม่ `discarded`, จุดของ `best` ใหญ่กว่าและมีป้าย "ดีที่สุดของร้าน: {qty} @ ฿{price}"
- เส้นนอนประที่ `TC_best` พร้อมป้าย "TC ที่ดีที่สุดของร้าน"
- เส้นประของข้อเสนอต่อรอง `tc(Q, pn)` ตลอดแกน และจุดรูปเพชรที่ `(qn, proposal.cost.total)` พร้อมป้าย "ข้อเสนอต่อรอง"
- การลาก: `pointerdown` บนจุดเพชรเรียก `setPointerCapture`, `pointermove` แปลงตำแหน่ง x ผ่าน `svg.getScreenCTM().inverse()` และ `linearScale.from` แล้วเรียก `onDragQ(Math.round(q))` โดยจำกัดในช่วง `[1, qMax]`
- แกน: ขีดประมาณ 5 ค่าต่อแกนที่เป็นเลขกลม ป้ายแกนนอน "ปริมาณสั่งซื้อต่อครั้ง (Q)" แกนตั้ง "TC ต่อปี (฿)"
- `role="img"` และ `aria-label` = `กราฟ TC: ข้อเสนอที่ดีที่สุดของร้านคือ {qty} ชิ้นที่ ฿{price} TC ฿{TC_best}; ข้อเสนอต่อรอง {qn} ชิ้นที่ ฿{pn} TC ฿{TC_n}`
- ล้างเนื้อหาเดิมของ `svg` ก่อนวาดทุกครั้ง แต่ระหว่างที่กำลังลากห้ามสร้างจุดเพชรใหม่ ให้ย้ายตำแหน่งของจุดเดิม เพื่อไม่ให้ pointer capture หลุด

- [ ] **Step 6: เขียน `renderPriceChart`**

- แกนตั้ง: จาก 97% ของราคาต่ำสุด (นับรวม `pn`) ถึง 101% ของราคาสูงสุด (นับรวม `pn`)
- เส้นขั้นบันไดของราคาร้านตามช่วง, เส้นโค้ง `breakEvenPrice(Q, TC_best, params)` สุ่มค่าทุก 1/200 ของแกนนอน ตัดด้วย `clipPath`
- ระบายพื้นที่ใต้เส้นเท่าทุนด้วยสีเขียวอ่อน พร้อมป้าย "ต่อรองได้ในโซนนี้ เราได้ประโยชน์"
- จุด `(qn, pn)`: ถ้า `proposal.saving ≥ 0` ใช้สีเขียวและป้าย "ได้ประโยชน์" ถ้าไม่ใช่ ใช้สีแดงและป้าย "แพงกว่าเดิม"
- ป้ายแกนตั้ง "ราคาต่อหน่วย (฿)", `role="img"` และ `aria-label` ที่บอกราคาเท่าทุนที่ `qn` และสถานะของข้อเสนอ

- [ ] **Step 7: ผูกเข้ากับ `js/app.js`**

ใน render เรียกทั้งสองฟังก์ชันภายใน `requestAnimationFrame` เดียว (ถ้ามี frame ที่รออยู่แล้วไม่ต้องขอซ้ำ) ส่ง `setProposalQty` เป็น `onDragQ` และเปลี่ยน max ของ slider `Qn` ไปใช้ `qMax` จาก `charts.js`

- [ ] **Step 8: ตรวจในเบราว์เซอร์**

- ค่าเริ่มต้น: กราฟ ① มีเส้น 3 ช่วงราคา จุดกระโดดที่ 1,000 และ 2,000 จุดเด่นที่ 1,000 และจุดเพชรที่ 714 อยู่ใต้เส้นนอน `TC_best`
- กราฟ ②: เส้นเท่าทุนตัดเส้นขั้นบันไดที่ Q = 1,000 พอดี และจุด (714, 4.80) อยู่ในโซนสีเขียว
- ลากจุดเพชรไปทางขวาจนถึงประมาณ 1,500: slider `Qn` และตัวเลขการ์ด ③ เปลี่ยนตาม และจุดในกราฟ ② เปลี่ยนเป็น "แพงกว่าเดิม"
- เลื่อน slider `D` ไปมาเร็ว ๆ: กราฟเปลี่ยนตามโดยไม่กระตุก และไม่มีเส้นล้นกรอบ
- ตั้ง `Qn` = 1: ไม่มีเส้นหรือจุดล้นกรอบ และการ์ด ③ แสดง "ไม่มีราคาที่คุ้มที่ล็อตนี้"
- ลบช่วงราคาจนเหลือช่วงเดียว และเพิ่มจนครบ 6 ช่วง: กราฟยังวาดถูก
- console ไม่มี error

- [ ] **Step 9: Commit**

```bash
git add js/charts.js js/app.js tests/charts.test.js
git commit -m "feat: add total cost and break-even price charts"
```

---

### Task 6: README และ deploy ขึ้น GitHub Pages

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: แอปที่เสร็จจาก Task 1–5

- [ ] **Step 1: เขียน `README.md`**

เนื้อหา: แอปนี้ทำอะไร (2–3 ประโยค), ลิงก์ `https://ad-xerline.github.io/QDM/`, สูตร 3 สูตรจาก Global Constraints, วิธีเปิดในเครื่อง (`python -m http.server 8765` แล้วเปิด `http://localhost:8765`), วิธีรันทดสอบ (`npm test`)

- [ ] **Step 2: รันชุดทดสอบทั้งหมด**

Run: `node --test`
Expected: PASS ทั้ง 24 test

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe the app, formulas and local usage"
```

- [ ] **Step 4: ขอให้ผู้ใช้ยืนยันก่อน merge และ push**

แจ้งผู้ใช้ว่า: จะ merge `feat/qdm-negotiator` เข้า `main` และ push ไปที่ `origin` ซึ่งทำให้โค้ดและไฟล์ใน `docs/` อยู่บน GitHub และ repo ต้องเป็น public จึงจะใช้ Pages แบบฟรีได้ รอคำตอบยืนยัน

- [ ] **Step 5: Merge และ push (หลังได้รับการยืนยัน)**

```bash
git checkout main
git merge --no-ff feat/qdm-negotiator -m "feat: QDM Negotiator web app"
git push origin main
```

- [ ] **Step 6: เปิด GitHub Pages**

เครื่องนี้ไม่มี `gh` CLI ให้ผู้ใช้เปิดเองที่ `https://github.com/AD-XERLINE/QDM/settings/pages`: Source = "Deploy from a branch", Branch = `main`, Folder = `/ (root)` แล้วกด Save

- [ ] **Step 7: ตรวจเว็บจริง**

เปิด `https://ad-xerline.github.io/QDM/` (อาจต้องรอ 1–2 นาทีหลัง Save) ตรวจว่าตาราง ④ แสดง TC 24,725.00 ที่แถว 2, กราฟทั้งสองแสดงผล, ฟอนต์ไทยโหลดได้ และ console ไม่มี error
