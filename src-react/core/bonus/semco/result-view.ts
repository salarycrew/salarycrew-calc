// core/bonus/semco/result-view.ts — 삼성전기 결과 화면의 뷰 모델.
//
// 화면이 보여주는 **모든 수**를 이 함수 하나가 만든다. 그래야
//   히어로 = OPI 현금 + TAI 현금 · 히어로 = 3개년 표 첫 행 소계 · 행마다 소계 = 두 토막의 합 · 누적 = 행의 합 · 곡선 현재점 = 히어로
// 같은 관계가 **구성으로** 성립하고, tests/semco-result-view.test.mjs가 그걸 잰다.
//
// 경계(CLAUDE.md §10): derive(calc-bridge.calcSemco)의 결과를 재배열·합산·대조만 한다. 재원율·지급률 상한·직급 배율은
// 여기서 새로 판단하지 않는다 — calcSemco가 낸 psPoolT·opiRateCap·gradeMul을 그대로 쓴다. 이 파일에 0.1이나 0.5 같은
// 제도 상수가 나타나면 잘못 들어온 것이다.
//
// 기준: 히어로·표는 **소득세 기준**(4대보험 별도) — 삼성·하이닉스 뷰 모델과 같은 자. 삼성전기는 자사주·이연이 없어 전액 현금이다.
// 단위: 금액 만원 정수 · 영업이익 조 · 비율 0~1.
import { calcSemco, SAMSUNG_RULES } from '../../calc-bridge.js';
import { gradeLabel } from '../samsung/labels.ts';
import { calcSemcoResult, getActiveSemcoYears, getSemcoOp, getSemcoWorkMonths, getSemcoYearSalary } from './derive.ts';
import type { SemcoInputs, SemcoResult } from './types.ts';

/** 그 해 손에 들어오는 돈의 두 토막(세후·소득세 기준) */
export interface SemcoPaidParts {
  opi: number;
  tai: number;
  total: number;      // = opi + tai
}

export interface SemcoCondition {
  grade: SemcoInputs['grade']; gradeLabel: string; isMonthly: boolean;
  salary: number; months: number; year: number; opT: number;
  avgSalary: number; headcount: number; h1: number; h2: number;
  taxRate: number | null; growthPct: number; years: number[];
}
export interface SemcoThreeYearRow extends SemcoPaidParts {
  year: number; salary: number; opT: number; months: number;
  pre: SemcoPaidParts;    // 같은 토막의 세전 금액 — 화면의 '세전 보기'가 읽는다
}
export interface SemcoThreeYear {
  years: number[];
  rows: SemcoThreeYearRow[];
  totals: SemcoPaidParts & { pre: SemcoPaidParts };
  growthPct: number;
  opNext: number | null;    // 둘째 해부터의 영업이익(전부 같으면 그 값)
}
export interface SemcoFormula {
  pool: { opT: number; rate: number; poolT: number };                                   // OP × 10% = 재원
  perHead: { headcount: number; avgMan: number };                                         // 재원 ÷ 인원
  opi: {
    base: number; baseLabel: string;                                                      // 계약연봉 · 월급 × 12
    rateRaw: number; rateCap: number; capped: boolean;                                   // 평균연봉 대비 → 상한 적용
    gradeMul: number; months: number; pre: number; post: number;
  };
  tai: { base: number; baseLabel: string; h1: number; h2: number; months: number; pre: number; post: number };
  tax: { incomeRate: number; manual: boolean; allRate: number };
  deduct: { incomeTax: number; health: number; emp: number; total: number; net: number };
}
export interface SemcoResultView {
  condition: SemcoCondition;
  hero: SemcoPaidParts & { pre: SemcoPaidParts };
  threeYear: SemcoThreeYear;
  formula: SemcoFormula;
}

const round = (n: number) => Math.round(n);

/** 소득세 기준 세후 비율 — calcSemco가 낸 소득세를 당해 세전으로 나눈 값 */
function afterTaxRatio(r: SemcoResult): number {
  return r.currentGross > 0 ? Math.max(0, r.currentGross - r.deductDetail.incomeTax) / r.currentGross : 0;
}

/** 한 해 결과의 두 토막 — 실효 소득세율을 항목별로 같이 적용하고, 합계는 토막의 합으로 정한다(구성 항등).
 *  pre=true는 **세금 떼기 전** — 비율을 1로 두는 것이 곧 세전이다. 세후에서 역산하지 않는다
 *  (토막마다 반올림이 들어가 되돌리면 합이 어긋난다). */
export function heroParts(r: SemcoResult, pre = false): SemcoPaidParts {
  const k = pre ? 1 : afterTaxRatio(r);
  const opi = round(r.psMan * k), tai = round(r.piMan * k);
  return { opi, tai, total: opi + tai };
}

/** 히어로 한 값 — curve.ts가 같은 함수로 곡선을 찍는다(항등식) */
export function heroTotal(inputs: SemcoInputs, results: SemcoResult = calcSemcoResult(inputs)): number {
  return heroParts(results).total;
}

export function buildSemcoResultView({ inputs, results }: { inputs: SemcoInputs; results: SemcoResult }): SemcoResultView {
  const years = getActiveSemcoYears(inputs);
  const year = years[0];
  const salary = getSemcoYearSalary(inputs, year);
  const months = getSemcoWorkMonths(inputs, year);
  const opT = getSemcoOp(inputs, year);
  const isMonthly = inputs.grade === 'monthly';
  const growthPct = Number(inputs.accumGrowth) || 0;
  const manualTax = inputs.taxRate != null && inputs.taxRate !== '' && Number.isFinite(+inputs.taxRate);
  const k = afterTaxRatio(results);

  const hero = { ...heroParts(results), pre: heroParts(results, true) };

  // ── 3개년(누적 연수만큼) — 해마다 그 해 조건으로 calcSemco. 첫 행은 calcSemcoResult와 같은 정규화라 히어로와 같다 ──
  const rows: SemcoThreeYearRow[] = years.map(y => {
    const s = getSemcoYearSalary(inputs, y), m = getSemcoWorkMonths(inputs, y), o = getSemcoOp(inputs, y);
    const r = calcSemco({ ...inputs, salary: s, months: m, opTril: o } as unknown as Parameters<typeof calcSemco>[0]) as SemcoResult;
    return { year: y, salary: s, opT: o, months: m, ...heroParts(r), pre: heroParts(r, true) };
  });
  const sum = (key: keyof SemcoPaidParts) => rows.reduce((a, r) => a + r[key], 0);
  const sumPre = (key: keyof SemcoPaidParts) => rows.reduce((a, r) => a + r.pre[key], 0);
  const totals: SemcoPaidParts & { pre: SemcoPaidParts } = {
    opi: sum('opi'), tai: sum('tai'), total: sum('total'),
    pre: { opi: sumPre('opi'), tai: sumPre('tai'), total: sumPre('total') },
  };
  const laterOps = rows.slice(1).map(r => r.opT);
  const opNext = laterOps.length && laterOps.every(o => o === laterOps[0]) ? laterOps[0] : null;
  const threeYear: SemcoThreeYear = { years, rows, totals, growthPct, opNext };

  // ── 이 숫자가 나온 계산 — calcSemco가 이미 낸 값을 문장 재료로 정렬만 ──
  const formula: SemcoFormula = {
    pool: { opT, rate: SAMSUNG_RULES.opiPoolRate, poolT: results.psPoolT },
    perHead: { headcount: Number(inputs.headcount) || 0, avgMan: round(results.psAvgMan) },
    opi: {
      // 화면 산식은 계산과 같은 기준금액을 말해야 한다 — 월급제는 **월급**이다(2026-09-16 리뷰 D-1).
      // 종전 '월급 × 12'는 12배 계산과 짝이 맞는 라벨이었고, 둘 다 틀렸다.
      base: salary, baseLabel: isMonthly ? '월급' : '계약연봉',
      rateRaw: results.opiRateRaw, rateCap: results.opiRateCap,
      capped: results.opiRateCap < (isMonthly ? results.opiRateRaw * 14 : results.opiRateRaw) - 1e-9,
      gradeMul: results.gradeMul, months, pre: round(results.psMan), post: hero.opi,
    },
    tai: {
      base: round(results.taiBase), baseLabel: isMonthly ? '월급 − 20만' : '연봉 ÷ 20',
      h1: Number(inputs.h1) || 0, h2: Number(inputs.h2) || 0, months, pre: round(results.piMan), post: hero.tai,
    },
    tax: { incomeRate: 1 - k, manual: manualTax, allRate: results.effRate / 100 },
    deduct: {
      incomeTax: results.deductDetail.incomeTax, health: results.deductDetail.health, emp: results.deductDetail.emp,
      total: results.deductDetail.total, net: round(results.net),
    },
  };

  const condition: SemcoCondition = {
    grade: inputs.grade, gradeLabel: gradeLabel(inputs.grade), isMonthly,
    salary, months, year, opT,
    avgSalary: Number(inputs.avgSalary) || 0, headcount: Number(inputs.headcount) || 0,
    h1: Number(inputs.h1) || 0, h2: Number(inputs.h2) || 0,
    taxRate: manualTax ? Number(inputs.taxRate) : null, growthPct, years,
  };

  return { condition, hero, threeYear, formula };
}
