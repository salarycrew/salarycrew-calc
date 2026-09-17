// core/bonus/hynix/result-view.ts — ⑲ 하이닉스 결과 화면의 뷰 모델.
//
// 화면이 보여주는 **모든 수**를 이 함수 하나가 만든다. 그래야
//   히어로 = PS 현금 + PI 현금 + PS 자사주 · 히어로 = 3개년 표 첫 행 소계 · 행마다 소계 = 네 토막의 합 ·
//   누적 = 행의 합 · 막대 세 토막 % 합 = 100
// 같은 관계가 **구성으로** 성립하고, tests/hynix-result-view.test.mjs가 그걸 잰다.
//
// 경계(CLAUDE.md §10): derive(calc-bridge.calcHynix · cashflow.buildHynixAccumRows)의 결과를 재배열·합산·대조만 한다.
// 지급 규칙(80:20 · 현금 50/자사주 30 · 이연 10+10)은 여기서 새로 판단하지 않는다 — psPayoutPlan과 cashflow의 몫이다.
// 이 파일에 0.4나 0.8 같은 제도 상수가 나타나면 잘못 들어온 것이다.
//
// 기준: 히어로·표는 **소득세 기준**(4대보험 별도) — 삼성 뷰 모델의 opiPost·spPost와 같은 기준이라 두 회사가 같은 자로 잰다.
// 단위: 금액 만원 정수 · 영업이익 조 · 비율 0~1 (표시용 %는 UI가).
import { buildHynixAccumRows } from '../../cashflow.js';
import { HYNIX_POOL_EFF_RATE } from '../../calc-bridge.js';
import { calcHynixResult, getActiveHynixYears, getHynixOp, getHynixWorkMonths, getHynixYearSalary } from './derive.ts';
import { payoutShape, samsungPayoutShape } from '../compare/payout-shape.ts';
import type { PayoutShape } from '../compare/payout-shape.ts';
import type { SamsungInputs } from '../samsung/types.ts';
import type { HynixInputs, HynixPayoutPlan, HynixResult } from './types.ts';

/** cashflow.buildHynixAccumRows 한 행 — JS가 만드는 필드의 계약 */
export interface HynixAccumRow extends HynixResult {
  year: number; salary: number; autoSalary: number; opTril: number; months: number;
  paidPsGross: number; paidPiGross: number; paidGross: number; paidDeduct: number; paidNet: number;
  paidPsNet: number; paidPiNet: number; paidIncomeOnly: number; remainDefer: number;
  paidCashGross?: number; paidStockGross?: number; paidCashNet?: number; paidStockNet?: number;
}

/** 그 해 손에 들어오는 돈의 네 토막(세후·소득세 기준) */
export interface PaidParts {
  psCash: number;     // PS 당해 현금분
  pi: number;         // PI (전액 현금)
  psStock: number;    // PS 당해 자사주분 — 그 해 바로 풀린다
  carryIn: number;    // 전년·전전년 이연분 유입(자사주)
  total: number;      // = psCash + pi + psStock + carryIn
}

export interface HynixCondition {
  salary: number; months: number; year: number; opT: number;
  avgSalary: number; headcount: number; h1: number; h2: number;
  taxRate: number | null; stockPrice: number | null; growthPct: number; years: number[];
}
export interface HynixHero extends PaidParts {
  deferredPre: number;    // 이연 20% (세전) — 1·2년 뒤 자사주
  deferredPost: number;   // 같은 몫을 올해 실효세율로 근사한 세후
  sharesNow: number | null;   // 당해 자사주 주식 수(절사) — stockPrice가 있을 때만
  pre: PaidParts;         // 같은 토막의 세전 금액 — 화면의 '세전 보기'가 읽는다
}
export interface HynixThreeYearRow extends PaidParts {
  year: number; salary: number; opT: number; months: number;
  remainDefer: number;    // 연말 미지급 이연 잔액(세전) — 스냅샷이라 합산하지 않는다
  pre: PaidParts;
}
export interface HynixThreeYear {
  years: number[];
  rows: HynixThreeYearRow[];
  totals: PaidParts & { pre: PaidParts };
  growthPct: number;
  opNext: number | null;  // 둘째 해부터의 영업이익(전부 같으면 그 값, 다르면 null) — 표 머리 문구용
}
export interface HynixFormula {
  pool: { opT: number; effRate: number; poolT: number };                       // OP × 10% = 재원
  perHead: { headcount: number; avgMan: number };                              // 재원 ÷ 인원
  ps: { salary: number; avgSalary: number; months: number; pre: number; rate: number };   // 1인 평균 × (내 연봉 ÷ 평균) × 근무
  pi: { base: number; h1: number; h2: number; pre: number };                   // 연봉 ÷ 20 × (상 + 하)
  split: { current: number; deferred: number; cashRatio: number | null; stockRatio: number | null };   // 세전 · 당해 80 / 이연 20
  tax: { incomeRate: number; manual: boolean; allRate: number };               // 소득세 실효율 · 4대보험 포함 실효율
  deduct: { incomeTax: number; health: number; emp: number; total: number; net: number };
}
export interface HynixResultView {
  condition: HynixCondition;
  plan: HynixPayoutPlan | null;
  hero: HynixHero;
  shape: { hynix: PayoutShape; samsung: PayoutShape };
  threeYear: HynixThreeYear;
  formula: HynixFormula;
}

export interface HynixViewParams {
  inputs: HynixInputs;
  results: HynixResult;
  samCms?: Partial<SamsungInputs> | null;   // 삼성 대조 막대용 운영 가정값(App이 넘긴다)
}

const round = (n: number) => Math.round(n);

/**
 * 한 행의 "그 해 손에 들어오는 돈"을 네 토막으로 — 소득세 기준 비례 배분.
 * cashflow가 낸 paidIncomeOnly/paidGross가 그 해의 세후 비율이다. 토막은 각각 반올림하고 합계는 토막의 합으로 정한다(구성 항등).
 */
export function splitPaid(row: Pick<HynixAccumRow, 'psMan' | 'piMan' | 'paidPsGross' | 'paidGross' | 'paidIncomeOnly' | 'psPayoutPlan' | 'psCashMan' | 'psStockMan'>, pre = false): PaidParts {
  // pre=true는 **세금 떼기 전** — 비율 k를 1로 두는 것이 곧 세전이다(같은 토막, 같은 항등식).
  // 세후에서 역산하지 않는다: 토막마다 반올림이 들어가 되돌리면 합이 어긋난다.
  const k = pre ? 1 : (row.paidGross > 0 ? row.paidIncomeOnly / row.paidGross : 0);
  const plan = row.psPayoutPlan;
  // 당해 PS = 현금분 + 자사주분(잠정합의) · 합의 데이터가 없으면 당해분 전액 현금 — 둘 다 calcHynix가 이미 나눠 놓은 값
  const psCurrentGross = row.psCashMan + row.psStockMan;
  const carryGross = Math.max(0, row.paidPsGross - psCurrentGross);
  const psCash = round(row.psCashMan * k);
  const pi = round(row.piMan * k);
  const psStock = plan ? round(row.psStockMan * k) : 0;
  const carryIn = round(carryGross * k);
  return { psCash, pi, psStock, carryIn, total: psCash + pi + psStock + carryIn };
}

/** 히어로 한 값 — 첫해 결과의 네 토막 합. curve.ts가 같은 함수로 곡선을 찍는다(항등식). */
export function heroTotal(inputs: HynixInputs, results: HynixResult = calcHynixResult(inputs)): number {
  return heroParts(results).total;
}

/** calcHynix 결과 하나를 첫해 행처럼 본다 — cashflow 첫 행과 같은 정의(이연 유입 0) */
export function heroParts(r: HynixResult, pre = false): PaidParts {
  // 반올림 전 값을 쓴다 — cashflow 첫 행이 같은 정의로 세후 비율을 만들기 때문(항등식)
  const incomeTax = r.incomeTaxRaw ?? r.deductDetail.incomeTax;
  return splitPaid({
    psMan: r.psMan, piMan: r.piMan, psCashMan: r.psCashMan, psStockMan: r.psStockMan, psPayoutPlan: r.psPayoutPlan,
    paidPsGross: r.psCashMan + r.psStockMan, paidGross: r.currentGross,
    paidIncomeOnly: Math.max(0, r.currentGross - incomeTax),
  }, pre);
}

export function buildHynixResultView({ inputs, results, samCms = null }: HynixViewParams): HynixResultView {
  const years = getActiveHynixYears(inputs);
  const year = years[0];
  const salary = getHynixYearSalary(inputs, year);
  const months = getHynixWorkMonths(inputs, year);
  const opT = getHynixOp(inputs, year);
  const growthPct = Number(inputs.accumGrowth) || 0;
  const priceRaw = Number(inputs.stockPrice);
  const stockPrice = Number.isFinite(priceRaw) && priceRaw >= 1 ? Math.round(priceRaw) : null;
  const manualTax = inputs.taxRate != null && inputs.taxRate !== '' && Number.isFinite(+inputs.taxRate);
  const plan = results.psPayoutPlan ?? null;

  // ── 히어로: 첫해 네 토막 ──
  const parts = heroParts(results);
  const k = results.currentGross > 0 ? Math.max(0, results.currentGross - results.deductDetail.incomeTax) / results.currentGross : 0;
  const deferredPre = round(results.psDefer);
  const deferredPost = round(results.psDefer * k);
  const hero: HynixHero = {
    ...parts, deferredPre, deferredPost,
    sharesNow: stockPrice && plan ? Math.floor(parts.psStock * 10000 / stockPrice) : null,
    pre: heroParts(results, true),
  };

  // ── 무엇으로 받나 — 세후 비율. 삼성은 같은 연봉의 삼성 뷰 모델 값 ──
  const shape = {
    hynix: payoutShape(parts.psCash + parts.pi, parts.psStock, deferredPost),
    samsung: samsungPayoutShape(salary, samCms),
  };

  // ── 3개년(누적 연수만큼) ──
  const accum = buildHynixAccumRows({ inputs, growthInput: inputs.accumGrowth }) as unknown as HynixAccumRow[];
  const rows: HynixThreeYearRow[] = accum.map(r => ({
    year: r.year, salary: r.salary, opT: r.opTril, months: r.months, remainDefer: round(r.remainDefer),
    pre: splitPaid(r, true),
    ...splitPaid(r),
  }));
  const sum = (key: keyof PaidParts) => rows.reduce((a, r) => a + r[key], 0);
  const sumPre = (k: keyof PaidParts) => rows.reduce((a, r) => a + r.pre[k], 0);
  const totals: PaidParts & { pre: PaidParts } = {
    psCash: sum('psCash'), pi: sum('pi'), psStock: sum('psStock'), carryIn: sum('carryIn'), total: sum('total'),
    pre: { psCash: sumPre('psCash'), pi: sumPre('pi'), psStock: sumPre('psStock'), carryIn: sumPre('carryIn'), total: sumPre('total') },
  };
  const laterOps = rows.slice(1).map(r => r.opT);
  const opNext = laterOps.length && laterOps.every(o => o === laterOps[0]) ? laterOps[0] : null;
  const threeYear: HynixThreeYear = { years, rows, totals, growthPct, opNext };

  // ── 이 숫자가 나온 계산 — calcHynix가 이미 낸 값을 문장 재료로 정렬만 ──
  const formula: HynixFormula = {
    pool: { opT, effRate: HYNIX_POOL_EFF_RATE, poolT: results.psPoolT },
    perHead: { headcount: Number(inputs.headcount) || 0, avgMan: round(results.psAvgMan) },
    ps: { salary, avgSalary: Number(inputs.avgSalary) || 0, months, pre: round(results.psMan), rate: results.psRate },
    pi: { base: round(salary / 20), h1: Number(inputs.h1) || 0, h2: Number(inputs.h2) || 0, pre: round(results.piMan) },
    split: {
      current: round(results.psCashMan + results.psStockMan), deferred: deferredPre,
      cashRatio: plan ? plan.cashRatio : null, stockRatio: plan ? plan.stockCurrentRatio : null,
    },
    tax: { incomeRate: 1 - k, manual: manualTax, allRate: results.effRate / 100 },
    deduct: {
      incomeTax: results.deductDetail.incomeTax, health: results.deductDetail.health, emp: results.deductDetail.emp,
      total: results.deductDetail.total, net: round(results.net),
    },
  };

  const condition: HynixCondition = {
    salary, months, year, opT,
    avgSalary: Number(inputs.avgSalary) || 0, headcount: Number(inputs.headcount) || 0,
    h1: Number(inputs.h1) || 0, h2: Number(inputs.h2) || 0,
    taxRate: manualTax ? Number(inputs.taxRate) : null, stockPrice, growthPct, years,
  };

  return { condition, plan, hero, shape, threeYear, formula };
}
