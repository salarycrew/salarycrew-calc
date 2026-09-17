// hynix-result-view.test.mjs — ⑲ 하이닉스 결과 화면 뷰 모델의 골든값 + 항등식.
//
// 값 하나가 맞는 테스트 + **값끼리의 관계**가 맞는 테스트(설계 2026-09-07 §4). 골든값은 계산기가 정본이다 —
// 시안 HynixResult의 숫자(10,162 · 560 · 9,838)는 다른 세율·주가를 가정한 조판용 값이라 그대로 쓰지 않는다
// (계산기: PS 현금 14,625 · PI 340 · PS 주식 8,775 · 소계 23,740 — calc-bridge 골든 psMan 48,188 · net 21,798과 같은 뿌리).
// 2026-09-17: 애드백 가결로 재원이 단순 10%로, 이연 20%가 복원되며 세후 소계가 26,685 → 23,740이 됐다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HYNIX_DEFAULTS, calcHynixResult, getActiveHynixYears } from '../src-react/core/bonus/hynix/derive.ts';
import { buildHynixResultView, heroTotal, heroParts, splitPaid } from '../src-react/core/bonus/hynix/result-view.ts';
import { sampleHeroCurve, heroAtOp, snapOp, CURVE_DEFAULT } from '../src-react/core/bonus/hynix/curve.ts';
import { payoutShape, toPct100 } from '../src-react/core/bonus/compare/payout-shape.ts';
import { calcHynix } from '../src-react/core/calc-bridge.js';

const view = (inputs = HYNIX_DEFAULTS, extra = {}) =>
  buildHynixResultView({ inputs, results: calcHynixResult(inputs), ...extra });

test('골든: 기본값(2026 · 5,600만 · OP 256조 · 평균 8,500만 · 35,000명 · PI 100/100)', () => {
  const v = view();
  assert.equal(v.condition.salary, 5600);
  assert.equal(v.condition.opT, 256);
  assert.equal(v.condition.year, 2026);
  assert.deepEqual(v.condition.years, [2026, 2027, 2028, 2029, 2030]);   // 기본 5개년(2026-09-10)
  assert.equal(v.hero.psCash, 14625);
  assert.equal(v.hero.pi, 340);
  assert.equal(v.hero.psStock, 8775);              // 당해 주식 30% — 현금 50%의 3/5
  assert.equal(v.hero.carryIn, 0);                 // 첫 해는 들어올 이연분이 없다
  assert.equal(v.hero.total, 23740);
  assert.equal(v.hero.deferredPre, 9638);          // 이연 20% 복원(가결 2026-09-16) = psMan × 0.2
  assert.equal(v.hero.sharesNow, null);            // 주가 미입력 — 주식 수는 계산하지 않는다(§2)
  assert.equal(v.formula.ps.pre, 48188);           // calc-bridge 골든 psMan
  assert.equal(v.formula.pi.pre, 560);
  assert.equal(v.formula.deduct.net, 21798);       // calc-bridge 골든 net
  assert.equal(Math.round(v.formula.pool.effRate * 10000) / 100, 10);   // 애드백 → 단순 10%(2026-09-17)
  assert.equal(v.formula.split.cashRatio, 0.5);
  assert.equal(v.formula.split.stockRatio, 0.3);   // 당해 주식만. 나머지 20%는 이연 주식
  assert.equal(v.plan?.status, 'ratified');
  assert.equal(v.threeYear.opNext, 380);
});

test('항등식: 히어로 = PS 현금 + PI + PS 자사주 + 이연 유입 · 히어로 ≈ 당해 지급 세전 − 소득세', () => {
  for (const inputs of [HYNIX_DEFAULTS, { ...HYNIX_DEFAULTS, salary: 9000, opTril: 150 }, { ...HYNIX_DEFAULTS, taxRate: 20, h1: 0, h2: 150 }]) {
    const v = view(inputs);
    assert.equal(v.hero.total, v.hero.psCash + v.hero.pi + v.hero.psStock + v.hero.carryIn);
    assert.equal(v.hero.carryIn, 0);   // 첫 해(2026)에는 전년 이연분이 없다 — HYNIX_YEARS가 2026부터다
    const r = calcHynixResult(inputs);
    assert.ok(Math.abs(v.hero.total - (r.currentGross - r.deductDetail.incomeTax)) <= 2, `${v.hero.total} vs ${r.currentGross - r.deductDetail.incomeTax}`);
  }
});

test('항등식: 3개년 첫 행 = 히어로 · 행마다 소계 = 네 토막의 합 · 누적 = 행의 합 · 이연 유입', () => {
  const v = view();
  const [r0] = v.threeYear.rows;
  assert.equal(r0.year, v.condition.year);
  assert.equal(r0.total, v.hero.total);
  assert.equal(r0.psCash, v.hero.psCash);
  assert.equal(r0.psStock, v.hero.psStock);
  assert.equal(r0.pi, v.hero.pi);
  for (const r of v.threeYear.rows) assert.equal(r.total, r.psCash + r.pi + r.psStock + r.carryIn, String(r.year));
  const t = v.threeYear.totals;
  const sum = (k) => v.threeYear.rows.reduce((a, r) => a + r[k], 0);
  for (const k of ['psCash', 'pi', 'psStock', 'carryIn', 'total']) assert.equal(t[k], sum(k), k);
  // 2026-09-17: 이연 20%가 복원돼(가결 2026-09-16) **첫 해만 0, 둘째 해부터 유입**이다.
  // 셋째 해가 더 크다 — 전년 10 + 전전년 10이 겹치기 때문이다. 이 모양이 이연 구조의 지문이다.
  // (2026-09-15~17 이연 0이던 동안 이 자리는 '전 행 0'을 재고 있었다. 그때의 자물쇠가 실제로 열렸다.)
  assert.equal(v.threeYear.rows[0].carryIn, 0, 'carryIn 첫 해');
  for (const r of v.threeYear.rows.slice(1)) assert.ok(r.carryIn > 0, `carryIn ${r.year}`);
  assert.ok(v.threeYear.rows[2].carryIn > v.threeYear.rows[1].carryIn, 'carryIn 셋째 해 > 둘째 해');
  assert.equal(v.threeYear.totals.carryIn, v.threeYear.rows.reduce((a, r) => a + r.carryIn, 0));
  assert.equal(v.threeYear.rows.length, getActiveHynixYears(HYNIX_DEFAULTS).length);
});

test('항등식: 첫해 조건 정규화 — 연도별 표에 2026 연봉·근무를 직접 넣어도 히어로 = 첫 행', () => {
  const inputs = { ...HYNIX_DEFAULTS, accumSalaryOverrides: { 2026: 7000 }, workMonthsByYear: { 2026: 6 }, months: 12 };
  const v = view(inputs);
  assert.equal(v.condition.salary, 7000);
  assert.equal(v.condition.months, 6);
  assert.equal(v.threeYear.rows[0].total, v.hero.total);
  assert.equal(v.threeYear.rows[0].salary, 7000);
});

test('항등식: 곡선 — 현재 OP의 점 = 히어로 · 격자 점 수 · 단조 증가(허들 없음) · snap', () => {
  const v = view();
  const pts = sampleHeroCurve(HYNIX_DEFAULTS);
  const expected = Math.round((CURVE_DEFAULT.max - CURVE_DEFAULT.min) / CURVE_DEFAULT.step) + 1;
  assert.equal(pts.length, expected);
  assert.equal(heroAtOp(HYNIX_DEFAULTS, 256).total, v.hero.total);
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].total >= pts[i - 1].total, `${pts[i].op}`);
  assert.equal(pts.every(p => p.eligible), true);
  assert.equal(heroTotal(HYNIX_DEFAULTS), v.hero.total);
  assert.equal(snapOp(257), 260);
  assert.equal(snapOp(-5), CURVE_DEFAULT.min);
  assert.equal(snapOp(9999), CURVE_DEFAULT.max);
});

test('막대: 세 토막 % 합 = 100 · 하이닉스 = (PS현금+PI) / PS자사주 / 이연 세후 · 삼성은 삼성 뷰 모델 값', () => {
  const v = view();
  for (const s of [v.shape.hynix, v.shape.samsung]) {
    assert.equal(s.pct.cash + s.pct.vestedNow + s.pct.later, 100);
    assert.equal(s.total, s.cash + s.vestedNow + s.later);
  }
  assert.equal(v.shape.hynix.cash, v.hero.psCash + v.hero.pi);
  assert.equal(v.shape.hynix.vestedNow, v.hero.psStock);
  assert.equal(v.shape.hynix.later, v.hero.deferredPost);
  assert.equal(v.shape.samsung.total, 28195);      // 삼성 골든 히어로(2026 · 5,600만 · 메모리 350조) — CMS가 300 → 350이 되며 이동(2026-09-11)
  assert.deepEqual(toPct100([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(toPct100([0, 0, 0]), [0, 0, 0]);
  assert.equal(payoutShape(0, 0, 0).total, 0);
});

test('주가를 넣으면 당해 자사주 주식 수(절사) · 잘못된 값이면 null', () => {
  const v = view({ ...HYNIX_DEFAULTS, stockPrice: 208000 });
  assert.equal(v.hero.sharesNow, Math.floor(v.hero.psStock * 10000 / 208000));
  assert.equal(view({ ...HYNIX_DEFAULTS, stockPrice: 0 }).hero.sharesNow, null);
  assert.equal(view({ ...HYNIX_DEFAULTS, stockPrice: 'abc' }).hero.sharesNow, null);
});

test('엣지: OP 0 → PS 0, PI만 · 근무 0개월 → 전부 0 · 수동 세율 0 → 히어로 = 세전', () => {
  const z = view({ ...HYNIX_DEFAULTS, opTril: 0 });
  assert.equal(z.hero.psCash, 0); assert.equal(z.hero.psStock, 0); assert.ok(z.hero.pi > 0);
  const m0 = view({ ...HYNIX_DEFAULTS, months: 0 });
  assert.equal(m0.hero.total, 0);
  const t0 = view({ ...HYNIX_DEFAULTS, taxRate: 0 });
  const r = calcHynix({ ...HYNIX_DEFAULTS, taxRate: 0 });
  assert.ok(Math.abs(t0.hero.total - r.currentGross) <= 2);
  assert.equal(t0.formula.tax.manual, true);
  // splitPaid는 합의 데이터가 없으면 당해분 전액 현금
  const p = splitPaid({ psMan: 100, piMan: 10, psCashMan: 80, psStockMan: 0, psPayoutPlan: null, paidPsGross: 80, paidGross: 90, paidIncomeOnly: 90 });
  assert.deepEqual(p, { psCash: 80, pi: 10, psStock: 0, carryIn: 0, total: 90 });
  assert.equal(heroParts(calcHynixResult(HYNIX_DEFAULTS)).total, view().hero.total);
});

// ── 세전 보기 ─────────────────────────────────────────────────────────────
// 하이닉스는 이연분까지 포함해 **모든 토막에 세전 짝이 있다**(삼성과 달리 주식 수 축이 없다).
// 재는 것은 값 하나가 아니라 값끼리의 관계다 — 어긋남은 눈으로 안 잡힌다(§10).
test('세전: 네 토막 합 = 합계 · 세전 > 세후 · 곡선과 히어로가 같은 값', async () => {
  const { HYNIX_DEFAULTS, calcHynixResult } = await import('../src-react/core/bonus/hynix/derive.ts');
  const { buildHynixResultView } = await import('../src-react/core/bonus/hynix/result-view.ts');
  const { heroAtOp } = await import('../src-react/core/bonus/hynix/curve.ts');
  const inputs = HYNIX_DEFAULTS;
  const v = buildHynixResultView({ inputs, results: calcHynixResult(inputs) });

  const p = v.hero.pre;
  assert.equal(p.total, p.psCash + p.pi + p.psStock + p.carryIn);
  assert.ok(p.total > v.hero.total, '세전 > 세후');

  for (const r of v.threeYear.rows) {
    assert.equal(r.pre.total, r.pre.psCash + r.pre.pi + r.pre.psStock + r.pre.carryIn, `${r.year}`);
    assert.ok(r.pre.total >= r.total, `${r.year} 세전 ≥ 세후`);
  }
  const t = v.threeYear.totals.pre;
  for (const k of ['psCash', 'pi', 'psStock', 'carryIn', 'total']) {
    assert.equal(t[k], v.threeYear.rows.reduce((a, r) => a + r.pre[k], 0), k);
  }
  // 조건 바 곡선의 지금 점 = 히어로 세전
  const opKey = Object.keys(inputs).find(k => /^opTril/.test(k)) || 'opTril';
  const at = heroAtOp(inputs, Number(inputs[opKey]));
  assert.equal(at.totalPre, p.total);
});
