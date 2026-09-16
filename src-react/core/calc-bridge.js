// calc-bridge.js — 계산 순수 함수 (React 앱이 실제로 쓰는 유일한 계산 코어)
// Vite 빌드 시 번들에 포함되어 window.* 전역 없이 동작
//
// 상수는 data/calc-constants.json을 단일 소스로 사용한다.
// tests/calc-bridge.test.mjs가 골든값·불변식을 검증한다.
import C from '../../data/calc-constants.json' with { type: 'json' };
import { getGradeMul } from './grades.js';

// 세율·상수 기준 메타(taxYear·rulesVersion·lastReviewedAt) — UI에 기준연도/최신여부 표시용
export const CALC_META = C._meta || {};

// JSON upTo: null → Infinity 변환
export const TAX_BRACKETS = C.tax.brackets.map(b => ({
  upTo: b.upTo ?? Infinity,
  rate: b.rate,
}));
export const HEALTH_RATE      = C.socialInsurance.healthCombined;
export const HEALTH_ONLY_RATE = C.socialInsurance.healthOnly;
export const LTC_OF_HEALTH    = C.socialInsurance.ltcOfHealth;
// 보수월액보험료 월 상·하한(만원, 노사 합산 기준) — 예전엔 core/calc/health.ts에 리터럴로
// 박혀 있었다. 매년 갱신되는 값인데 calc-constants.json 밖에 있으면 taxYear·lastReviewedAt
// 갱신 때 같이 안 바뀔 수 있다(2026-09-14 외부 리뷰, ChatGPT GPT-6 Astra).
export const HEALTH_TOTAL_CAP_MAN   = C.socialInsurance.healthTotalCapMan;
export const HEALTH_TOTAL_FLOOR_MAN = C.socialInsurance.healthTotalFloorMan;
export const EMP_RATE    = C.socialInsurance.employment;
export const NPS_RATE    = C.socialInsurance.nps;
export const NPS_CAP_YR  = C.socialInsurance.npsCap;

// 최저임금 — 실업급여 하한 등 파생값의 단일 출처(data/calc-constants.json).
// 연도별 표에서 '계산 시점' 값을 고른다 — 2027-01-01이 되면 자동으로 새 값이 적용된다.
export const MIN_WAGE_BY_YEAR = C.minimumWage?.byYear || {};
export function minWageHourly(date = new Date()) {
  const y = date.getFullYear();
  const table = MIN_WAGE_BY_YEAR;
  if (table[y] != null) return table[y];
  const years = Object.keys(table).map(Number).sort((a, b) => a - b);
  const past = years.filter((v) => v <= y);
  return table[past.length ? past.at(-1) : years[0]] ?? 0;
}

export const SAMSUNG_RULES = Object.freeze({
  opiPoolRate:      C.samsung.opiPoolRate,
  spPoolRate:       C.samsung.spPoolRate,
  divSplit:         C.samsung.divSplit,
  bizSplit:         C.samsung.bizSplit,
  sangsaengRate:    C.samsung.sangsaengRate,
  sangsaengHurdleMW: C.samsung.sangsaengHurdle * 1e4, // JSON: 만원 단위 → MW
});

export const HYNIX_RULES = Object.freeze({
  psPoolRate:     C.hynix.psPoolRate,
  psPoolCircular: C.hynix.psPoolCircular === true,
  psDeferRatio:   C.hynix.psDeferRatio,
});

// PS 재원 실효율 — R = (OP − R) × r → OP × r / (1 + r). r = 10%면 OP/11 ≈ 9.0909%.
// **사용자 결정(2026-09-15)**: 실지급 실적 대비 비율을 근거로 9.09%를 유지한다.
// 주의 — 이 식을 '공시가 재원 차감 전이라서'로 읽지 마라. 그 전제는 2026-09-15 DART 대조로
// 성립하지 않는 것이 확인됐다(공시 영업이익은 이미 차감 후다. 근거 3종은 _psPoolCircularWhy).
// 이 식은 **실측 지급 비율을 맞추는 수단**이다. 실측은 2025년 실적분 4.5조/47.21조 = 9.53%였고,
// 그 차이의 사유는 솔리다임 영업이익 제외였다(2025년 실적분이 마지막).
// 재판정 방아쇠 둘: ① 솔리다임 제외 종료 ② 애드백 가결 시 R = (OP + R) × r → OP/9 = 11.11%
// (지금과 반대 방향). 9/15~16 총투표 대기 — 확정 전이라 넣지 않는다(§12-E).
export const HYNIX_POOL_EFF_RATE = HYNIX_RULES.psPoolCircular
  ? HYNIX_RULES.psPoolRate / (1 + HYNIX_RULES.psPoolRate)
  : HYNIX_RULES.psPoolRate;

// 2026 임단협 수정 잠정합의(2026-09-10) — PS 지급 '수단' 분해(현금/자사주). 비율 자체는 기존과 같다:
// 당해 80%(현금 50 + 자사주 30) + 이연 20%(1년 10 + 2년 10)이라 psDeferRatio는 그대로 유효하고
// 세후 총액도 변하지 않는다(즉시매도 가정). 바뀌는 건 '무엇으로 받느냐'와 주가 노출뿐.
// 1차안(현금 40 + 자사주 60)은 2026-08-25 투표에서 25표 차로 부결됐다 — 재투표는 9/15~16.
export const HYNIX_PAYOUT_2026 = Object.freeze(C.hynix.psPayout2026 || null);

export const PSU_RULES = C.psu.rules;

// 소득세 본세(지방소득세 제외) — TAX_BRACKETS는 지방세 10%가 포함된 통합세율이라 1.1로 나눈다.
// 실수령·연말정산은 본세 기준으로 세액공제를 적용한 뒤 지방세 10%를 별도 가산해야 한다.
export function incomeTaxOf(amount) {
  return taxOf(amount) / 1.1;
}

// 근로소득세액공제 (2026 기준) — 산출세액 130만 이하 55%, 초과분 30% / 총급여별 한도
export function earnedIncomeTaxCredit(grossPay, calculatedIncomeTax) {
  const raw = calculatedIncomeTax <= 130
    ? calculatedIncomeTax * 0.55
    : 71.5 + (calculatedIncomeTax - 130) * 0.30;
  const g = Math.max(0, grossPay);
  const cap = g <= 3300 ? 74
    : g <= 7000 ? Math.max(66, 74 - (g - 3300) * 0.008)
    : g <= 12000 ? Math.max(50, 66 - (g - 7000) * 0.5)
    : Math.max(20, 50 - (g - 12000) * 0.5);
  return Math.max(0, Math.min(raw, cap));
}

// 성과급 세후 계산용 통합세율(소득세+지방소득세) 누진 계산 — 지방세를 별도 가산하지 말 것.
export function taxOf(amount) {
  if (amount <= 0) return 0;
  let tax = 0, prev = 0;
  for (const b of TAX_BRACKETS) {
    const slice = Math.min(amount, b.upTo) - prev;
    if (slice > 0) tax += slice * b.rate;
    if (amount <= b.upTo) break;
    prev = b.upTo;
  }
  return tax;
}

export function earnedDed(g) {
  if (g <= 500)   return g * 0.70;
  if (g <= 1500)  return 350  + (g -  500) * 0.40;
  if (g <= 4500)  return 750  + (g - 1500) * 0.15;
  if (g <= 10000) return 1200 + (g - 4500) * 0.05;
  return Math.min(1475 + (g - 10000) * 0.02, 2000);
}

export function bonusTaxDeducted(annualPay, bonusPre) {
  const sb = Math.max(0, annualPay - earnedDed(annualPay) - 150);
  const ti = annualPay + bonusPre;
  const tb = Math.max(0, ti - earnedDed(ti) - 150);
  // 본세에서 근로소득세액공제를 차감한 뒤 지방세 10% 가산 — 성과급이 총급여 구간
  // (3,300/7,000/1.2억)을 넘기며 공제 한도가 줄어드는 변화분까지 성과급 몫으로 반영.
  // 두 급여가 같은 한도 구간이면 공제 차이가 0이라 기존 결과와 동일하다.
  const withBonus = incomeTaxOf(tb) - earnedIncomeTaxCredit(ti, incomeTaxOf(tb));
  const baseOnly = incomeTaxOf(sb) - earnedIncomeTaxCredit(annualPay, incomeTaxOf(sb));
  return Math.max(0, (withBonus - baseOnly) * 1.1);
}

export function getPsuMultiplier(returnPct) {
  let active = PSU_RULES[0];
  PSU_RULES.forEach(r => { if (returnPct >= r.threshold) active = r; });
  return active;
}

export function splitShares3Y(totalShares) {
  const base = Math.floor(totalShares / 3);
  const rem  = totalShares % 3;
  return [0, 1, 2].map(i => base + (i < rem ? 1 : 0));
}

// 사업부 풀(60%)은 양수 영업이익 비율로 각 사업부에 배분한다.
// 메모리 몫은 메모리+공통(70% 가중) 그룹 안에서 함께 나눠 공통분까지 재원 안에 포함한다.
// 적자 사업부는 사업부 풀 0 (부문 풀 40%는 base 가중치로 기존과 동일하게 지급).
// 공통(common)은 메모리 biz rate × comW(0.7) 적용.
// p: { bonusBaseMW, opiPaidTotalMW, hMem, hCom, hFnd, hLsi, avgSalary,
//      memBaseW, comW, fndBaseW, lsiBaseW, opMem, opFnd, opLsi, eligible }
export function calcSamsungSpecialRate(p) {
  if (!p.eligible) return { mem: 0, com: 0, fnd: 0, lsi: 0 };
  const spBaseMW    = Math.max(p.bonusBaseMW - p.opiPaidTotalMW, 0);
  const totalPoolMW = spBaseMW * SAMSUNG_RULES.spPoolRate;
  const divPoolMW   = totalPoolMW * SAMSUNG_RULES.divSplit;
  const bizPoolMW   = totalPoolMW * SAMSUNG_RULES.bizSplit;

  // 부문 풀 (40%): 인원 × 직급 기반 균등 배분 (기존 유지)
  const divH    = p.hMem*p.memBaseW + p.hCom*p.comW + p.hFnd*p.fndBaseW + p.hLsi*p.lsiBaseW;
  const divRate = divH * p.avgSalary > 0 ? divPoolMW / (divH * p.avgSalary) : 0;

  // 사업부 풀 (60%): 각 사업부가 번 비율(양수 OP 기준)만큼 배분 후 인원으로 나눔
  const posMemOP    = Math.max(p.opMem, 0);
  const posFndOP    = Math.max(p.opFnd, 0);
  const posLsiOP    = Math.max(p.opLsi, 0);
  const totalPosOP  = posMemOP + posFndOP + posLsiOP;

  let memBizRate = 0, fndBizRate = 0, lsiBizRate = 0;
  if (totalPosOP > 0 && p.avgSalary > 0) {
    const memGroupH = p.hMem + p.hCom * p.comW;
    memBizRate = memGroupH > 0 ? bizPoolMW * posMemOP / totalPosOP / (memGroupH * p.avgSalary) : 0;
    fndBizRate = p.hFnd > 0 ? bizPoolMW * posFndOP / totalPosOP / (p.hFnd * p.avgSalary) : 0;
    lsiBizRate = p.hLsi > 0 ? bizPoolMW * posLsiOP / totalPosOP / (p.hLsi * p.avgSalary) : 0;
  }
  const comBizRate = memBizRate * p.comW;

  return {
    mem: divRate * p.memBaseW + memBizRate,
    com: divRate * p.comW     + comBizRate,
    fnd: divRate * p.fndBaseW + fndBizRate,
    lsi: divRate * p.lsiBaseW + lsiBizRate,
    // 산식 가이드용 상세 정보
    _detail: {
      divRate, divPoolMW, bizPoolMW, totalPosOP,
      posMemOP, posFndOP, posLsiOP,
      memGroupH: p.hMem + p.hCom * p.comW,
      memBizRate, fndBizRate, lsiBizRate, comBizRate,
    },
  };
}

export function calcHynix(p) {
  const sal = Math.max(0, p.salary);
  const avg = p.avgSalary > 0 ? p.avgSalary : 8500;
  const hc  = p.headcount > 0 ? p.headcount : 35000;
  const wr  = Math.max(0, Math.min(12, p.months)) / 12;
  // 영업이익 입력은 '-'·'1.' 같은 중간 입력 문자열일 수 있어 안전 파싱 (NaN → 0)
  const opTrilNum = Number(p.opTril);
  const psOp    = Math.max(0, Number.isFinite(opTrilNum) ? opTrilNum : 0);
  const psPoolT = psOp * HYNIX_POOL_EFF_RATE;
  const psAvg   = (psOp * 1e12 * HYNIX_POOL_EFF_RATE / hc) / 10000;
  const psMan   = psAvg * (sal / avg) * wr;
  const piMan   = (sal / 20) * ((p.h1 + p.h2) / 100) * wr;
  const grossMan = psMan + piMan;
  const psDefer  = psMan * HYNIX_RULES.psDeferRatio;
  const currentGross = psMan * (1 - HYNIX_RULES.psDeferRatio) + piMan;
  // 2026 임단협 잠정합의 기준 지급 수단 분해. 합계(psCashMan + psStockMan)는 정확히
  // psMan * (1 - psDeferRatio)라서 currentGross·세금·누적표 어디에도 영향을 주지 않는다.
  // 폴백(합의 데이터가 없으면)은 종전대로 당해분 전액 현금.
  const split = HYNIX_PAYOUT_2026;
  const psCashMan  = psMan * (split ? split.cashRatio : (1 - HYNIX_RULES.psDeferRatio));
  const psStockMan = psMan * (split ? split.stockCurrentRatio : 0);
  const rateBase = sal > 0 ? sal : 0;
  // 빈 값(null)만 자동세율, 명시적 0도 유효한 수동세율로 처리.
  const manualTaxRate = p.taxRate != null && Number.isFinite(+p.taxRate)
    ? Math.max(0, Math.min(70, +p.taxRate)) : null;
  const taxAmt = manualTaxRate != null
    ? currentGross * (manualTaxRate / 100)
    : bonusTaxDeducted(sal, currentGross);
  // 건보 법정 상한(보수월액 총 918.3만/월)은 여기 미반영 — 성과급만 따로 계산하는 근사
  // 모델이라 월급과의 합산 상한을 정확히 알 수 없고, 오차는 연 총보수 15억+에서만 생긴다.
  // 실수령 계산기(salary-net)에는 상한이 반영돼 있다 (2026-08-06 리뷰).
  const health = currentGross * HEALTH_RATE;
  const emp = currentGross * EMP_RATE;
  const deduct = taxAmt + health + emp;
  const net    = currentGross - deduct;
  const effRate = currentGross > 0 ? deduct / currentGross * 100 : 0;
  return {
    psPoolT,
    psAvgMan: psAvg,
    psRate: rateBase > 0 ? psMan / rateBase : 0,
    piRate: rateBase > 0 ? piMan / rateBase : 0,
    grossRate: rateBase > 0 ? grossMan / rateBase : 0,
    currentRate: rateBase > 0 ? currentGross / rateBase : 0,
    psMan,
    piMan,
    grossMan,
    psDefer,
    psCashMan,
    psStockMan,
    psPayoutPlan: HYNIX_PAYOUT_2026,
    currentGross,
    deduct,
    net,
    effRate,
    // 반올림 전 소득세 — 히어로의 네 토막 배분(result-view.splitPaid)은 이 값을 쓴다.
    // deductDetail.incomeTax는 표시용 반올림값이라, 그걸로 비율 k를 만들면 cashflow 첫 행과
    // 토막이 1만원씩 어긋난다(2026-09-15 항등식 테스트가 잡았다).
    incomeTaxRaw: taxAmt,
    deductDetail: {
      incomeTax: Math.round(taxAmt),
      health: Math.round(health),
      emp: Math.round(emp),
      total: Math.round(deduct)
    }
  };
}

export function calcSemco(p) {
  const sal = Math.max(0, p.salary);
  const avg = p.avgSalary > 0 ? p.avgSalary : 7000;
  const hc  = p.headcount > 0 ? p.headcount : 12000;
  const wr  = Math.max(0, Math.min(12, p.months)) / 12;
  const opTrilNum = Number(p.opTril);
  const opiOp = Math.max(0, Number.isFinite(opTrilNum) ? opTrilNum : 0);
  const opiPoolT = opiOp * SAMSUNG_RULES.opiPoolRate;
  const opiAvg = (opiPoolT * 1e12 / hc) / 10000;
  const opiRateRaw = avg > 0 ? opiAvg / avg : 0;
  const isMonthly = p.grade === 'monthly';
  const opiRateCap = isMonthly ? Math.min(opiRateRaw * 14, 7) : Math.min(opiRateRaw, 0.5);
  // 지급 기준금액은 **p.salary 그대로**다 — 월급제면 월급, 연봉제면 계약연봉.
  // 월급제 지급률(opiRateCap)이 이미 `opiRateRaw * 14`로 **월급 배수**(최대 700%)로 환산된 값이라,
  // 여기에 다시 ×12를 하면 12배가 된다(2026-09-16 외부 리뷰 D-1 · 월급 400 기준 1,093만 → 13,120만).
  // 같은 파일의 삼성 본체가 정본이다: `(isMonthly ? salary : annualSalary) * opiRateCap`(:354).
  // 연봉 기준 지급률이 필요한 곳은 아래 rateBase(월급 × 12)이고 그건 세율·표시용이다.
  const opiBase = sal;
  const gradeMul = isMonthly ? 1 : getGradeMul(p.grade);
  const opiMan = opiBase * opiRateCap * wr * gradeMul;
  const taiBase = isMonthly ? Math.max(0, sal - 20) : sal / 20;
  const taiMan = taiBase * ((p.h1 + p.h2) / 100) * wr;
  const grossMan = opiMan + taiMan;
  const currentGross = grossMan;
  const rateBase = isMonthly ? sal * 12 : sal;
  const manualTaxRate = p.taxRate != null && Number.isFinite(+p.taxRate)
    ? Math.max(0, Math.min(70, +p.taxRate)) : null;
  const taxAmt = manualTaxRate != null
    ? currentGross * (manualTaxRate / 100)
    : bonusTaxDeducted(rateBase, currentGross);
  const health = currentGross * HEALTH_RATE;
  const emp = currentGross * EMP_RATE;
  const deduct = taxAmt + health + emp;
  const net = currentGross - deduct;
  const effRate = currentGross > 0 ? deduct / currentGross * 100 : 0;
  return {
    psPoolT: opiPoolT,
    psAvgMan: opiAvg,
    psRate: rateBase > 0 ? opiMan / rateBase : 0,
    piRate: rateBase > 0 ? taiMan / rateBase : 0,
    grossRate: rateBase > 0 ? grossMan / rateBase : 0,
    currentRate: rateBase > 0 ? currentGross / rateBase : 0,
    psMan: opiMan,
    piMan: taiMan,
    grossMan,
    psDefer: 0,
    currentGross,
    deduct,
    net,
    effRate,
    opiRateRaw,
    opiRateCap,
    gradeMul,
    taiBase,
    deductDetail: {
      incomeTax: Math.round(taxAmt),
      health: Math.round(health),
      emp: Math.round(emp),
      total: Math.round(deduct)
    }
  };
}

// ── 삼성 계산 헬퍼 ──
export function calcSamsungPool({ year = 2026, opMem, opFnd, opLsi, totalH, avgSalary }) {
  const dsOpT = opMem + opFnd + opLsi;
  const dsOpPosMW = Math.max(dsOpT, 0) * 1e8;
  const useSangsaeng = Number(year) <= 2030;
  const sangsaengMW = useSangsaeng && dsOpPosMW > SAMSUNG_RULES.sangsaengHurdleMW
    ? (dsOpPosMW - SAMSUNG_RULES.sangsaengHurdleMW) * SAMSUNG_RULES.sangsaengRate
    : 0;
  const bonusBaseMW = dsOpPosMW - sangsaengMW;
  const opiPoolMW = bonusBaseMW * SAMSUNG_RULES.opiPoolRate;
  const opiPerHead = totalH > 0 ? opiPoolMW / totalH : 0;
  const opiRateRaw = avgSalary > 0 ? opiPerHead / avgSalary : 0;
  // 특별경영성과급 지급 허들 — **200조 고정이 아니다.** 2026년 성과급 노사 잠정 합의서 1-다:
  // "향후 10년 간 적용하되, 2026년부터 2028년까지 매 해마다 DS부문 영업이익 200조원 달성 시
  //  지급하고, 2029년부터 2035년까지 매 해마다 DS부문 영업이익 100조 달성 시 지급한다."
  // 판정은 **해마다 따로** 한다(누적이 아니다). 근거 없는 값으로 의심받아 두 번 확인했으므로
  // 원문을 여기 적어 둔다(2026-09-10) — 가이드는 /guide/special.
  const thresholdT = Number(year) >= 2029 ? 100 : 200;
  const eligible = dsOpT >= thresholdT;
  return { bonusBaseMW, opiRateRaw, eligible, dsOpT, sangsaengMW, thresholdT };
}

/**
 * 삼성 단일 연도·단일 사업부 OPI+특별성과급 계산 순수 함수.
 * useCalcState(단일 연도 전체 사업부)와 AccumTable(다년도 단일 사업부) 양쪽에서 사용.
 */
export function calcSamsungOneDeptYear({
  year, dept,
  salary, annualSalary, isMonthly,
  workR, spWorkR, gradeMul, academicOn,
  avgSalary, totalH,
  hMem, hCom, hFnd, hLsi,
  opMem, opFnd, opLsi,
  taxOverride, stockPrice,
}) {
  const { bonusBaseMW, opiRateRaw, eligible } = calcSamsungPool({
    year, opMem, opFnd, opLsi, totalH, avgSalary,
  });

  const opiRateCap = isMonthly
    ? Math.min(opiRateRaw * 14, 7)
    : Math.min(opiRateRaw, 0.5);
  const opiPre = (isMonthly ? salary : annualSalary) * opiRateCap * workR * gradeMul;
  const opiPaidTotalMW = avgSalary * (isMonthly ? opiRateCap / 14 : opiRateCap) * totalH;

  const penaltyRule = year >= 2027;
  const memBaseW = penaltyRule && opMem < 0 ? 0.6 : 1;
  const fndBaseW = penaltyRule && opFnd < 0 ? 0.6 : 1;
  const lsiBaseW = penaltyRule && opLsi < 0 ? 0.6 : 1;

  const specialRates = calcSamsungSpecialRate({
    bonusBaseMW, opiPaidTotalMW,
    hMem, hCom, hFnd, hLsi,
    avgSalary, memBaseW, comW: 0.7, fndBaseW, lsiBaseW,
    opMem, opFnd, opLsi, eligible,
  });

  // 학술연수 감면은 spWorkR((n+(12−n)/2)/12)에 반영되므로 지급률 자체는 사업부 지급률 그대로 사용.
  const effectiveSpecialRate = specialRates[dept] || 0;
  const spPre = (isMonthly ? salary * 14 : annualSalary) * effectiveSpecialRate * spWorkR * gradeMul;
  const totalPre = opiPre + spPre;

  // 세율 직접입력: 빈 값(null)만 자동세율, 명시적 0도 유효한 수동세율(세금 0%)로 처리.
  const hasManualTax = taxOverride != null && Number.isFinite(+taxOverride);
  const incomeTax = hasManualTax
    ? totalPre * Math.max(0, Math.min(70, +taxOverride)) / 100
    : bonusTaxDeducted(annualSalary, totalPre);
  const effRate = totalPre > 0 ? incomeTax / totalPre : 0;

  const opiPost = Math.round(opiPre * (1 - effRate));
  const spPost  = Math.round(spPre  * (1 - effRate));
  const px = Math.max(1, stockPrice || 1);
  const shares  = Math.floor(spPost * 10000 / px);
  const stVal   = Math.round(shares * px / 10000);

  return {
    // 자사주 지급 여부는 허들(eligible)만 기준. 학술연수는 지급률(spWorkR)에만 영향, 지급 여부엔 영향 없음.
    eligible, stockEligible: eligible,
    opiPre: Math.round(opiPre), opiPost,
    spPre:  Math.round(spPre),  spPost,
    shares, stVal, effRate,
    specialRate: effectiveSpecialRate, spWorkR,
    opiRateCap, totalPre, incomeTax,
    specialRates,
    // 산식 가이드용: 부문/사업부 풀 상세
    spDetail: specialRates?._detail,
    spBaseRate: specialRates?.[dept] || 0,
    spDivRate: (() => {
      const d = specialRates?._detail;
      if (!d) return 0;
      if (dept === 'mem') return d.divRate * memBaseW;
      if (dept === 'fnd') return d.divRate * fndBaseW;
      if (dept === 'lsi') return d.divRate * lsiBaseW;
      if (dept === 'com') return d.divRate * 0.7;
      return 0;
    })(),
    spBizRate: (() => {
      const d = specialRates?._detail;
      if (!d) return 0;
      if (dept === 'mem') return d.memBizRate;
      if (dept === 'fnd') return d.fndBizRate;
      if (dept === 'lsi') return d.lsiBizRate;
      if (dept === 'com') return d.comBizRate;
      return 0;
    })(),
  };
}
