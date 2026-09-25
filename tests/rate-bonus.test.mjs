// rate-bonus 단위 테스트 — 지급률형 성과급(LG전자·한화에어로·현대차·기아)
import assert from 'node:assert/strict';
import { RATE_COMPANIES, calcRateBonus, calcRateResult, rateDefaults, resolveRate } from '../src-react/core/bonus/rate/derive.ts';
import { bonusTaxDeducted } from '../src-react/core/calc-bridge.js';

// 1) 데이터 무결성 — 사업부 공지형(divisions)과 임단협형(ratePct) 두 갈래 모두
for (const [key, co] of Object.entries(RATE_COMPANIES)) {
  assert.ok(co.name && co.payName && co.asOf, `${key} 표시용 메타`);
  assert.ok(co.defaults.baseMonthly > 0, `${key} 기본 월 기본급`);
  if (co.divisions) {
    assert.ok(co.divisions.length >= 5, `${key} 사업부 5개 이상`);
    for (const d of co.divisions) {
      assert.ok(d.id && d.label, `${key}/${d.id} 라벨`);
      assert.ok(d.rate > 0 && d.rate < 2000, `${key}/${d.id} 지급률 범위`);
    }
    assert.ok(co.divisions.some((d) => d.id === co.defaults.division), `${key} 기본 사업부 실존`);
    const ids = new Set(co.divisions.map((d) => d.id));
    assert.equal(ids.size, co.divisions.length, `${key} 사업부 id 중복 없음`);
  } else if (key === 'custom') {
    // '직접 입력'(2026-09-09) — 공지값이 없다. 0에서 시작해 사용자가 넣는다: 숫자를 지어내지 않는다(§2).
    assert.equal(co.ratePct, 0, '직접 입력은 공지 지급률이 없다');
    assert.equal(co.fixedMan, 0, '직접 입력은 공지 정액이 없다');
    assert.ok(!co.history && !co.pending && !co.extras, '직접 입력에는 회사 이력·잠정합의·부속 항목이 없다');
  } else {
    // 임단협형 — 사업부 차등이 없으니 회사 단위 지급률 하나가 반드시 있어야 한다.
    assert.ok(co.ratePct > 0 && co.ratePct < 2000, `${key} 회사 지급률 범위`);
    assert.ok(co.breakdown?.length > 0, `${key} 항목 내역`);
  }
}

// 2026년 투표가 끝난 두 회사는 계산 화면에 미확정 배너가 없어야 한다.
for (const key of ['hyundai', 'kia']) {
  const co = RATE_COMPANIES[key];
  assert.ok(!co.pending && /타결/.test(co.asOf), `${key}: 계산 화면은 타결 상태`);
}

// 1-b) 확정 전 값을 쓰는 회사는 그 사실이 데이터에 남아 있어야 한다.
//      잠정합의 ≠ 타결이고 부결되면 금액이 달라진다 — 배너가 안 뜨면 확정처럼 읽힌다.
//      가결되면 pending을 지우고 asOf를 '타결'로 바꾸는데, 그때 이 테스트가 짝을 맞춰 준다.
for (const [key, co] of Object.entries(RATE_COMPANIES)) {
  if (!co.pending) {
    assert.ok(!/잠정합의/.test(co.asOf), `${key}: asOf가 잠정합의인데 pending이 없다`);
    continue;
  }
  assert.equal(co.pending.status, 'tentative', `${key} pending 상태값`);
  assert.ok(/투표/.test(co.pending.vote), `${key} pending에 투표 일정`);
  assert.ok(co.pending.text?.length > 10, `${key} pending 설명`);
  assert.ok(/잠정합의/.test(co.asOf), `${key} asOf에 잠정합의 표기`);
  assert.ok(/확정값이 아닙니다|확정 아님/.test(co.sourceNote), `${key} 출처 주석에 미확정 표기`);
}

// 1-c) 임단협형 extras — 세후 금액에서 뺀 항목은 뺀 이유가 같이 있어야 한다.
for (const [key, co] of Object.entries(RATE_COMPANIES)) {
  for (const x of co.extras || []) {
    assert.ok(x.label && x.why, `${key} extras 항목·이유`);
  }
}

// 2) 세전 계산 — LG 전장 539%: 월 기본급 400만 → 2,156만
{
  const r = calcRateBonus({ baseMonthly: 400, ratePct: 539, fixedMan: 0, annualPay: 8000 });
  assert.equal(r.gross, 2156);
  assert.ok(r.tax > 0 && r.net === r.gross - r.tax);
}

// 3) 정액 인센 포함 — 한화 LS 725% + 400만: 월 기본급 380만 → 2,755+400=3,155만
{
  const r = calcRateBonus({ baseMonthly: 380, ratePct: 725, fixedMan: 400, annualPay: 7500 });
  assert.equal(r.gross, 3155);
}

// 4) 세후 = calc-bridge 한계세율 로직과 일치
{
  const gross = 400 * 539 / 100;
  const expectTax = Math.round(bonusTaxDeducted(8000, gross));
  const r = calcRateBonus({ baseMonthly: 400, ratePct: 539, annualPay: 8000 });
  assert.equal(r.tax, expectTax);
}

// 5) 경계 — 0 입력은 전부 0, 음수 방어
{
  const z = calcRateBonus({ baseMonthly: 0, ratePct: 539, annualPay: 8000 });
  assert.deepEqual([z.gross, z.tax, z.net], [0, 0, 0]);
  const n = calcRateBonus({ baseMonthly: -100, ratePct: -5, fixedMan: -400, annualPay: -1 });
  assert.deepEqual([n.gross, n.tax, n.net], [0, 0, 0]);
}

// 6) 실효세율 표기 범위
{
  const r = calcRateBonus({ baseMonthly: 400, ratePct: 539, annualPay: 8000 });
  assert.ok(r.effTaxPct > 0 && r.effTaxPct < 50, `실효세율 상식 범위: ${r.effTaxPct}`);
}

// 7) 임단협형 — 현대차·기아 모두 400% + 1,270만. 월 기본급 300만 → 1,200+1,270=2,470만
for (const key of ['hyundai', 'kia']) {
  const co = RATE_COMPANIES[key];
  assert.equal(co.ratePct, 400, `${key} 지급률 400%`);
  assert.equal(co.fixedMan, 1270, `${key} 정액 1,270만`);
  const r = calcRateBonus({ baseMonthly: 300, ratePct: co.ratePct, fixedMan: co.fixedMan, annualPay: 4200 });
  assert.equal(r.gross, 2470, `${key} 세전`);
  assert.ok(r.net > 0 && r.net < r.gross, `${key} 세후`);
}

// 8) 자사주·포인트는 세후 금액에 섞이지 않는다 — 지급 시점 주가로 값이 달라지는 것을
//    하나의 숫자로 뭉뚱그리지 않기로 한 설계(하이닉스 대응 계획 §4-C)와 같은 원칙.
{
  const hy = RATE_COMPANIES.hyundai;
  assert.ok(hy.extras.some((x) => /주식|자사주/.test(x.label)), '현대차 주식이 extras에');
  assert.ok(RATE_COMPANIES.kia.extras.some((x) => /자사주/.test(x.label)), '기아 자사주가 extras에');
  const r = calcRateBonus({ baseMonthly: 300, ratePct: hy.ratePct, fixedMan: hy.fixedMan, annualPay: 4200 });
  assert.equal(r.gross, 300 * 4 + 1270, '세전에 주식 평가액이 섞이지 않음');
}

console.log('✅ rate-bonus: 전 케이스 통과');

// 5) '직접 입력' — 값이 전부 사용자 입력이다. 세전 = 기본급 × 지급률 + 정액.
{
  const co = RATE_COMPANIES.custom;
  const base = rateDefaults(co);
  assert.equal(resolveRate(co, base), 0, '아무것도 안 넣으면 0 — 지어내지 않는다');
  assert.equal(calcRateResult(co, base).gross, 0);

  const inputs = { ...base, baseMonthly: 400, rateOverride: 400, fixedOverride: 300, annualPay: 6000 };
  assert.equal(resolveRate(co, inputs), 400);
  const r = calcRateResult(co, inputs);
  assert.equal(r.gross, 400 * 4 + 300, '세전 = 기본급 × 지급률 + 정액');
  assert.equal(r.net, r.gross - r.tax, '세후 = 세전 − 소득세');

  // 정액을 비우면 회사 공지 정액(직접 입력은 0)으로 돌아간다
  assert.equal(calcRateResult(co, { ...inputs, fixedOverride: null }).gross, 1600);
}
