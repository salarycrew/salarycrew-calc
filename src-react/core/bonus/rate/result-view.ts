// core/bonus/rate/result-view.ts — 지급률형 4사 결과 화면의 뷰 모델. 항등식: 추정 차감 후 = 세전 − 추정 소득세 · 세전 = 입력 기준금액 × 지급률 + 정액.
// 경계(CLAUDE.md §10): derive가 낸 값의 재배열뿐 — 세율·근사 배수는 derive의 것이다.
import { calcRateResult, pickDivision, resolveAnnualPay, resolveFixed, resolveRate, ANNUAL_PAY_MULT } from './derive.ts';
import type { RateCompany, RateInputs, RateResult } from './types.ts';

export interface RateCondition {
  hasDivisions: boolean;
  division: string | null; divisionLabel: string | null;
  rate: number; rateIsOverride: boolean;
  baseMonthly: number;
  annualPay: number; annualPayIsAuto: boolean; annualPayMult: number;
  fixedMan: number; fixedLabel: string | null; fixedIsOverride: boolean;
  /** 회사 공지값이 아니라 사용자가 전부 넣는 항목('직접 입력') */
  isCustom: boolean;
}
export interface RateResultView {
  company: RateCompany;
  condition: RateCondition;
  hero: RateResult;
}

export function buildRateResultView({ company, inputs }: { company: RateCompany; inputs: RateInputs }): RateResultView {
  const div = pickDivision(company, inputs);
  const rate = resolveRate(company, inputs);
  const annualPay = resolveAnnualPay(inputs);
  const hero = calcRateResult(company, inputs);
  const condition: RateCondition = {
    hasDivisions: !!div,
    division: div ? div.id : null, divisionLabel: div ? div.label : null,
    rate, rateIsOverride: inputs.rateOverride != null && inputs.rateOverride !== '',
    baseMonthly: Math.max(0, Number(inputs.baseMonthly) || 0),
    annualPay, annualPayIsAuto: inputs.annualPay == null || inputs.annualPay === '', annualPayMult: ANNUAL_PAY_MULT,
    fixedMan: resolveFixed(company, inputs), fixedLabel: company.fixedLabel,
    fixedIsOverride: inputs.fixedOverride != null && inputs.fixedOverride !== '',
    isCustom: company.key === 'custom',
  };
  return { company, condition, hero };
}
