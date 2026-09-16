// semco-result-view.test.mjs — 삼성전기 결과 화면 뷰 모델의 골든값 + 항등식.
//
// 값 하나가 맞는 테스트 + **값끼리의 관계**가 맞는 테스트(설계 2026-09-07 §4). 골든값은 계산기가 정본이다 —
// calc-bridge 골든([4b] OPI 재원 = 영업이익 10% · TAI = 연봉/20 × 상하반기%)과 같은 뿌리.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SEMCO_DEFAULTS, calcSemcoResult, getActiveSemcoYears } from '../src-react/core/bonus/semco/derive.ts';
import { buildSemcoResultView, heroTotal, heroParts } from '../src-react/core/bonus/semco/result-view.ts';
import { sampleHeroCurve, heroAtOp, snapOp, CURVE_DEFAULT } from '../src-react/core/bonus/semco/curve.ts';
import { calcSemco } from '../src-react/core/calc-bridge.js';

const view = (inputs = SEMCO_DEFAULTS) => buildSemcoResultView({ inputs, results: calcSemcoResult(inputs) });

test('골든: 기본값(2026 · 연봉제 일반 · 5,600만 · OP 1.64조 · 평균 7,000만 · 12,000명 · TAI 75/75)', () => {
  const v = view();
  assert.equal(v.condition.salary, 5600);
  assert.equal(v.condition.opT, 1.64);
  assert.equal(v.condition.year, 2026);
  assert.equal(v.condition.gradeLabel, '연봉제 일반');
  assert.deepEqual(v.condition.years, [2026, 2027, 2028, 2029, 2030]);   // 기본 5개년(2026-09-10)
  assert.equal(v.hero.opi, 864);
  assert.equal(v.hero.tai, 332);
  assert.equal(v.hero.total, 1196);
  assert.equal(v.formula.pool.poolT, 0.164);              // calc-bridge 골든 psPoolT
  assert.equal(v.formula.pool.rate, 0.1);
  assert.equal(v.formula.perHead.avgMan, 1367);
  assert.equal(v.formula.opi.pre, 1093);
  assert.equal(v.formula.tai.pre, 420);                    // 280 × (75% + 75%)
  assert.equal(v.formula.tai.base, 280);
  assert.equal(v.formula.opi.capped, false);
  assert.equal(v.formula.deduct.net, 1121);
  assert.equal(v.threeYear.opNext, null);                  // 2027 1.85 · 2028 2.05 — 해마다 다르다
});

test('항등식: 히어로 = OPI + TAI · 히어로 ≈ 세전 − 소득세 · 이연 0', () => {
  for (const inputs of [SEMCO_DEFAULTS, { ...SEMCO_DEFAULTS, salary: 9000, opTril: 3 }, { ...SEMCO_DEFAULTS, grade: 'monthly', salary: 400, taxRate: 20 }, { ...SEMCO_DEFAULTS, h1: 0, h2: 100, months: 6 }]) {
    const v = view(inputs);
    assert.equal(v.hero.total, v.hero.opi + v.hero.tai);
    const r = calcSemcoResult(inputs);
    assert.ok(Math.abs(v.hero.total - (r.currentGross - r.deductDetail.incomeTax)) <= 2, `${v.hero.total} vs ${r.currentGross - r.deductDetail.incomeTax}`);
    assert.equal(r.psDefer, 0);
  }
});

test('항등식: 3개년 첫 행 = 히어로 · 행마다 소계 = 두 토막의 합 · 누적 = 행의 합', () => {
  const v = view();
  const [r0] = v.threeYear.rows;
  assert.equal(r0.year, v.condition.year);
  assert.equal(r0.total, v.hero.total);
  assert.equal(r0.opi, v.hero.opi);
  assert.equal(r0.tai, v.hero.tai);
  for (const r of v.threeYear.rows) assert.equal(r.total, r.opi + r.tai, String(r.year));
  const t = v.threeYear.totals;
  const sum = (k) => v.threeYear.rows.reduce((a, r) => a + r[k], 0);
  assert.equal(t.opi, sum('opi')); assert.equal(t.tai, sum('tai')); assert.equal(t.total, sum('total'));
  assert.equal(t.total, t.opi + t.tai);
  assert.equal(v.threeYear.rows.length, getActiveSemcoYears(SEMCO_DEFAULTS).length);
});

test('첫해 정규화: 연도별 표의 첫해 급여·근무가 히어로에 반영된다(옛 훅은 salary·months만 봤다)', () => {
  const inputs = { ...SEMCO_DEFAULTS, accumSalaryOverrides: { 2026: 8000 }, workMonthsByYear: { 2026: 6 } };
  const v = view(inputs);
  assert.equal(v.condition.salary, 8000);
  assert.equal(v.condition.months, 6);
  assert.equal(v.hero.total, v.threeYear.rows[0].total);
  const raw = calcSemco({ ...inputs, salary: 8000, months: 6 });
  assert.equal(v.hero.total, heroParts(raw).total);
});

test('지급률 상한: 영업이익이 아주 크면 OPI가 평평해진다(capped) — 판단은 calcSemco의 것', () => {
  const v = view({ ...SEMCO_DEFAULTS, opTril: 100 });
  assert.equal(v.formula.opi.capped, true);
  assert.equal(v.formula.opi.rateCap, 0.5);   // calc-bridge 골든: 연봉제 상한 50%
  const a = heroAtOp(SEMCO_DEFAULTS, 50).total, b = heroAtOp(SEMCO_DEFAULTS, 100).total;
  assert.equal(a, b);
});

test('곡선: 격자 0.5~4 · 0.1 · 36점 · 현재 OP의 점 = 히어로 · 단조 증가 · 격자 값은 소수 첫째 자리', () => {
  const pts = sampleHeroCurve(SEMCO_DEFAULTS);
  assert.equal(pts.length, 36);
  assert.equal(pts[0].op, CURVE_DEFAULT.min);
  assert.equal(pts[pts.length - 1].op, CURVE_DEFAULT.max);
  for (const p of pts) assert.equal(p.op, Math.round(p.op * 10) / 10);
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].total >= pts[i - 1].total, `${pts[i - 1].op}→${pts[i].op}`);
  assert.equal(heroAtOp(SEMCO_DEFAULTS, 1.64).total, heroTotal(SEMCO_DEFAULTS));
  assert.equal(heroAtOp(SEMCO_DEFAULTS, 1.64).total, view().hero.total);
  assert.equal(snapOp(1.64), 1.6);
  assert.equal(snapOp(9), 4);
  assert.equal(snapOp(0.01), 0.5);
});

test('엣지: 영업이익 0 → OPI 0 · TAI만 · 비연봉제(월급)는 **월급** 기준 · 근무 0개월 → 0', () => {
  const zero = view({ ...SEMCO_DEFAULTS, opTril: 0 });
  assert.equal(zero.hero.opi, 0);
  assert.ok(zero.hero.tai > 0);
  const m = view({ ...SEMCO_DEFAULTS, grade: 'monthly', salary: 400 });
  assert.equal(m.condition.isMonthly, true);
  // 2026-09-16까지 이 줄은 4800(= 월급 × 12)을 기대해 **12배 오류를 고정하고 있었다**(외부 리뷰 D-1).
  // 월급제 지급률은 이미 월급 배수라 기준금액은 월급 그대로여야 한다.
  assert.equal(m.formula.opi.base, 400);
  assert.equal(m.formula.tai.base, 380);
  const none = view({ ...SEMCO_DEFAULTS, months: 0 });
  assert.equal(none.hero.total, 0);
});

// 2026-09-16 외부 리뷰 D-1 회귀 — 이 저장소의 계산 사고는 전부 **단위**에서 났다(§2).
// 구현을 다시 적어 고정하지 않고, ① 산식의 기준금액이 입력과 같은 단위인가 ② 코드가 채택한
// 상한(월급 700%)이 실제 금액으로 지켜지는가 두 가지를 독립적으로 잰다.
test('단위: 월급제 OPI는 월급 배수다 — 기준금액 = 월급 · 상한 700% = 월급 × 7', () => {
  const monthly = { ...SEMCO_DEFAULTS, grade: 'monthly', salary: 400, months: 12 };

  // ① 산식의 기준금액은 입력한 월급 그대로 — 화면 문장과 계산이 같은 수를 말한다
  const v = view(monthly);
  assert.equal(v.formula.opi.base, monthly.salary);
  assert.equal(v.formula.opi.baseLabel, '월급');
  const pre = v.formula.opi.base * v.formula.opi.rateCap * v.formula.opi.gradeMul * (v.formula.opi.months / 12);
  assert.equal(Math.round(pre), v.formula.opi.pre);

  // ② 상한 — 영업이익이 아무리 커도 월급의 700%를 넘지 않는다(월급 400 → 2,800만)
  const capped = calcSemco({ ...monthly, opTril: 100, h1: 50, h2: 50 });
  assert.equal(Math.round(capped.opiRateCap * 1e4) / 1e4, 7);
  assert.equal(Math.round(capped.psMan), monthly.salary * 7);

  // ③ 기본 영업이익(1.64조)에서의 실제 금액 — 지급률 273.33%는 월급에 붙는다
  const base = calcSemco({ ...monthly, h1: 50, h2: 50 });
  assert.equal(Math.round(base.psMan), Math.round(monthly.salary * base.opiRateCap));

  // ④ 연봉제는 계약연봉 기준 그대로(상한 50%) — 월급제 수정이 연봉제를 건드리지 않았다
  const annual = calcSemco({ ...SEMCO_DEFAULTS, h1: 50, h2: 50 });
  assert.ok(annual.opiRateCap <= 0.5);
  assert.equal(Math.round(annual.psMan), Math.round(SEMCO_DEFAULTS.salary * annual.opiRateCap));
});

// ── 세전 보기 ─────────────────────────────────────────────────────────────
test('세전: OPI + TAI = 합계 · 세전 > 세후 · 곡선과 히어로가 같은 값', async () => {
  const { SEMCO_DEFAULTS, calcSemcoResult } = await import('../src-react/core/bonus/semco/derive.ts');
  const { buildSemcoResultView } = await import('../src-react/core/bonus/semco/result-view.ts');
  const { heroAtOp } = await import('../src-react/core/bonus/semco/curve.ts');
  const inputs = SEMCO_DEFAULTS;
  const v = buildSemcoResultView({ inputs, results: calcSemcoResult(inputs) });

  assert.equal(v.hero.pre.total, v.hero.pre.opi + v.hero.pre.tai);
  assert.ok(v.hero.pre.total > v.hero.total, '세전 > 세후');
  for (const r of v.threeYear.rows) {
    assert.equal(r.pre.total, r.pre.opi + r.pre.tai, `${r.year}`);
    assert.ok(r.pre.total > r.total, `${r.year} 세전 > 세후`);
  }
  const t = v.threeYear.totals.pre;
  for (const k of ['opi', 'tai', 'total']) {
    assert.equal(t[k], v.threeYear.rows.reduce((a, r) => a + r.pre[k], 0), k);
  }
  const at = heroAtOp(inputs, Number(v.condition.opT));
  assert.equal(at.totalPre, v.hero.pre.total);
});
