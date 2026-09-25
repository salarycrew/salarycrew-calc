// core/bonus/rate/derive.ts — '지급률 발표형' 성과급 계산 (LG전자·한화에어로·현대차·기아, 2026-08-08 → 2026-09-07 S5b core/bonus/rate/).
//
// 삼성 OPI처럼 산식(초과이익 %)이 아니라, 회사가 해마다 '기본급의 N%'를 사후 공지하거나 임단협으로 정하는 유형.
// 계산은 월 기본급 × 지급률(+ 정액)이 전부라 컨센서스 모델 없이 최신 공지 지급률을 기본값으로 심는다.
// 새해 공지가 나오면 divisions/ratePct만 갱신. 옛 경로 core/rate-bonus.js는 이 파일을 re-export하는 shim.
//
// 두 갈래가 있다.
//   사업부 공지형(LG·한화) — divisions[]가 있고 사업부를 고르면 지급률이 따라온다.
//   임단협형(현대차·기아)  — 전 조합원 동일 조건이라 divisions가 없고 ratePct 하나다.
//
// 임단협형은 가결 전 잠정합의를 다룰 수 있다. 그때만 pending을 두고 미확정 배너를 띄운다.
// 가결 후에는 pending을 지우고 asOf·출처·이력을 함께 갱신한다.
import { bonusTaxDeducted } from '../../calc-bridge.js';
import type { RateCompany, RateDivision, RateInputs, RateResult } from './types.ts';

export type { RateCompany, RateDivision, RateInputs, RateResult, RatePending, RateExtra, RateHistory, RateBreakdown } from './types.ts';

export const RATE_COMPANIES: Record<string, RateCompany> = {
  lge: {
    key: 'lge',
    name: 'LG전자',
    payName: '경영성과급',
    // 2025년 실적분 — 2026-01-30 사업본부별 공지, 02-10 지급 (언론 보도 종합)
    asOf: '2025년 실적 · 2026-02-10 지급분',
    sourceNote: '사업본부별 공지(2026-01-30) 언론 보도 기준 · 본사/CDO 등 미공개 조직은 직접 입력',
    fixedMan: 0,
    fixedLabel: null,
    divisions: [
      { id: 'vs', label: 'VS 전장', rate: 539 },
      { id: 'es-aircare', label: 'ES 에어케어', rate: 445 },
      { id: 'es-rac', label: 'ES RAC', rate: 325 },
      { id: 'es-sac', label: 'ES SAC', rate: 275 },
      { id: 'es-common', label: 'ES 공통', rate: 275 },
      { id: 'es-chiller', label: 'ES 칠러', rate: 215 },
      { id: 'hs-living', label: 'HS 리빙솔루션', rate: 320 },
      { id: 'hs-comp', label: 'HS 부품솔루션', rate: 225 },
      { id: 'hs-common', label: 'HS 공통', rate: 210 },
      { id: 'hs-kitchen', label: 'HS 키친솔루션', rate: 200 },
      { id: 'ms', label: 'MS TV·미디어', rate: 47 },
    ],
    defaults: { division: 'vs', baseMonthly: 400 },
    history: [
      { period: '2025년 실적 (2026-02 지급)', top: 'VS 539%', note: 'ES 에어케어 445 · HS 리빙 320 · MS(TV) 47' },
      { period: '2024년 실적 (2025-02 지급)', top: 'VS 510%', note: 'H&A 리빙 470 · 에어/부품 370 · TV 140' },
      { period: '2023년 실적 (2024-02 지급)', top: 'H&A 리빙 665%', note: '에어 565 · 부품 515 · VS 455 · TV 200~300' },
    ],
  },
  hanwhaaero: {
    key: 'hanwhaaero',
    name: '한화에어로스페이스',
    payName: '성과급',
    // 2025년 실적분 — 2026-02 보도(사업부별 지급률 + 목표 영업이익 돌파 정액 인센 400만)
    asOf: '2025년 실적 · 2026-02 공지분',
    sourceNote: '2026-02 언론 보도 기준(사업부별 지급률 + 전사 정액 인센티브)',
    fixedMan: 400,
    fixedLabel: '목표 영업이익 돌파 인센티브',
    divisions: [
      { id: 'ls', label: 'LS(지상방산)', rate: 725 },
      { id: 'pgm', label: 'PGM', rate: 702.8 },
      { id: 'mro', label: 'MRO', rate: 510.6 },
      { id: 'space', label: '우주', rate: 507 },
      { id: 'qa', label: '품질보증', rate: 497 },
      { id: 'avi', label: '항공', rate: 494.8 },
    ],
    defaults: { division: 'ls', baseMonthly: 380 },
    history: [
      { period: '2025년 실적 (2026-02 지급)', top: 'LS 725%', note: 'PGM 702.8 · MRO 510.6 · 우주 507 + 인센 400만' },
      { period: '2024년 실적 (2025-02 지급)', top: '최대 710%', note: '+ 일시금 500만 — 2년 연속 최대 실적' },
    ],
  },
  hyundai: {
    key: 'hyundai',
    name: '현대자동차',
    payName: '성과급',
    asOf: '2026년 임금협상 타결(8/31 가결)',
    // https://www.newsis.com/view/NISX20260831_0003770400
    sourceNote: '2026-08-25 잠정합의안이 8/31 조합원 투표에서 가결된 기준',
    // 경영성과금 400% + 일시금 1,270만 — 둘 다 현금이라 세후 계산에 들어간다.
    ratePct: 400,
    fixedMan: 1270,
    fixedLabel: '일시금',
    breakdown: [
      { label: '경영성과금', value: '월 기본급의 400%' },
      { label: '일시금', value: '1,270만원' },
    ],
    // 아래는 합의안에 있지만 세후 금액에 넣지 않은 것들. 뺀 이유까지 적어 둔다 —
    // 안 적으면 '뉴스에 나온 항목이 왜 없냐'는 질문이 그대로 남는다.
    extras: [
      { label: '주식 15주', why: '평가액이 지급 시점 주가에 따라 달라져 하나의 숫자로 못 묶습니다' },
      { label: '해시(복지)포인트 50만원', why: '현금이 아니라 포인트입니다' },
      { label: '기본급 10만원 인상(호봉승급분 포함)', why: '성과급이 아니라 임금 인상분입니다' },
      { label: '하기휴가비 20만원 인상', why: '2027년부터 적용됩니다' },
    ],
    defaults: { baseMonthly: 300 },
    history: [
      { period: '2026년 임금협상 (8/31 가결)', top: '400% + 1,270만', note: '주식 15주 · 복지포인트 50만 · 기본급 10만 인상' },
      { period: '2025년 임단협 (2025-09 타결)', top: '450% + 1,580만', note: '기본급 10만 인상 · 자사주 30주' },
    ],
  },
  kia: {
    key: 'kia',
    name: '기아',
    payName: '성과급',
    asOf: '2026년 임단협 타결(8/28 가결)',
    // https://www.yna.co.kr/amp/view/AKR20260828138200061
    sourceNote: '2026-08-25 잠정합의안이 8/28 조합원 투표에서 가결된 기준',
    // 경영성과금 300% + 품질향상 격려금 100% = 400%,
    // 정액 400만 + 470만 + 오토카 어워즈 400만 = 1,270만. 현대차와 총액이 같다.
    ratePct: 400,
    fixedMan: 1270,
    fixedLabel: '격려금·일시금 합계',
    breakdown: [
      { label: '경영성과금', value: '월 기본급의 300% + 400만원' },
      { label: '품질향상 격려금', value: '월 기본급의 100% + 470만원' },
      { label: '오토카 어워즈 수상기념 격려금', value: '400만원' },
    ],
    extras: [
      { label: '단체교섭 타결 격려금 자사주 47주', why: '평가액이 지급 시점 주가에 따라 달라져 하나의 숫자로 못 묶습니다' },
      { label: '최대 생산·판매 목표달성 특별 포인트 50만 포인트', why: '현금이 아니라 포인트입니다' },
      { label: '기본급 10만원 인상', why: '성과급이 아니라 임금 인상분입니다' },
    ],
    defaults: { baseMonthly: 300 },
    history: [
      { period: '2026년 임단협 (8/28 가결)', top: '400% + 1,270만', note: '자사주 47주 · 특별포인트 50만 · 6년 연속 무분규' },
      { period: '2025년 임단협 (2025-09 타결)', top: '450% + 1,600만', note: '5년 연속 무분규 타결' },
    ],
  },
  custom: {
    // '직접 입력' — 회사가 아니라 계산 방식이다. 공지값이 없으니 기본 지급률도 0에서 시작한다:
    // 숫자를 지어내지 않는다(§2). 사용자가 회사 공지에서 본 값을 그대로 넣는다.
    key: 'custom',
    name: '내 회사',
    payName: '성과급',
    asOf: '내가 넣은 값',
    sourceNote: '회사 공지가 아니라 직접 넣은 값입니다 — 이 사이트는 그 값을 검증하지 않습니다',
    ratePct: 0,
    fixedMan: 0,
    fixedLabel: '정액·일시금',
    defaults: { baseMonthly: 300 },
  },
};

/** 회사의 첫 입력 — 기본 사업부 · 기본 월 기본급 · 지급률·연봉은 공지값·근사값 */
export function rateDefaults(co: RateCompany): RateInputs {
  return { division: co.defaults.division ?? null, baseMonthly: co.defaults.baseMonthly, rateOverride: null, fixedOverride: null, annualPay: null };
}

/** 적용 정액(만원) — 직접 고친 값 > 회사 공지 정액. '직접 입력'에서만 값이 들어온다 */
export function resolveFixed(co: RateCompany, inputs: RateInputs): number {
  if (inputs.fixedOverride != null && inputs.fixedOverride !== '') return Math.max(0, Number(inputs.fixedOverride) || 0);
  return co.fixedMan ?? 0;
}

/** 선택된 사업부 — 공지형만. 없는 id면 첫 사업부 */
export function pickDivision(co: RateCompany, inputs: Pick<RateInputs, 'division'>): RateDivision | null {
  if (!Array.isArray(co.divisions) || co.divisions.length === 0) return null;
  return co.divisions.find(d => d.id === inputs.division) ?? co.divisions[0];
}

/** 적용 지급률(%) — 직접 고친 값 > 선택 사업부 공지율 > 회사 지급률 */
export function resolveRate(co: RateCompany, inputs: RateInputs): number {
  if (inputs.rateOverride != null && inputs.rateOverride !== '') return Number(inputs.rateOverride) || 0;
  const div = pickDivision(co, inputs);
  return div ? div.rate : (co.ratePct ?? 0);
}

/** 세후 추정용 연봉(만원) — 직접 입력이 없으면 월 기본급 × 14 근사(상여·수당 포함). 근사라는 사실은 화면이 말한다 */
export const ANNUAL_PAY_MULT = 14;
export function resolveAnnualPay(inputs: RateInputs): number {
  if (inputs.annualPay != null && inputs.annualPay !== '') return Math.max(0, Number(inputs.annualPay) || 0);
  return Math.round((Number(inputs.baseMonthly) || 0) * ANNUAL_PAY_MULT);
}

// baseMonthly: 월 기본급(만) · ratePct: 지급률(%) · fixedMan: 전사 정액(만)
// annualPay: 성과급 제외 연봉(만) — 세후(한계세율) 추정용
export function calcRateBonus({ baseMonthly, ratePct, fixedMan = 0, annualPay }:
  { baseMonthly: number | string; ratePct: number | string; fixedMan?: number; annualPay: number | string }): RateResult {
  const base = Math.max(0, Number(baseMonthly) || 0);
  const rate = Math.max(0, Number(ratePct) || 0);
  const fixed = Math.max(0, Number(fixedMan) || 0);
  const gross = base * rate / 100 + fixed;
  const pay = Math.max(0, Number(annualPay) || 0);
  const tax = gross > 0 ? bonusTaxDeducted(pay, gross) : 0;
  return {
    gross: Math.round(gross),
    tax: Math.round(tax),
    net: Math.round(gross - tax),
    effTaxPct: gross > 0 ? Math.round((tax / gross) * 1000) / 10 : 0,
  };
}

/** 회사 + 입력 → 결과 (입력 해석은 위 resolve*가, 계산은 calcRateBonus가) */
export function calcRateResult(co: RateCompany, inputs: RateInputs): RateResult {
  return calcRateBonus({ baseMonthly: inputs.baseMonthly, ratePct: resolveRate(co, inputs), fixedMan: resolveFixed(co, inputs), annualPay: resolveAnnualPay(inputs) });
}
