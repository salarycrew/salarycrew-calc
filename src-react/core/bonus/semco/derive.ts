// core/bonus/semco/derive.ts — OPI+TAI 엔진의 입력 파생·상수 (React-free).
//
// 2026-09-18: 같은 산식을 쓰는 회사가 둘이 됐다(삼성전기·삼성SDI). 회사별로 다른 값은 전부
// companies.ts로 나갔고 여기는 **그 값으로 입력을 짓는 규칙**만 남는다 — SEMCO_* 이름은
// 소비처(ai-worker·check-calc-drift·공개 저장소)가 물고 있어 그대로 둔다.
//
// 2026-09-07 S5b: core/semco-derive.js를 옮기고 경계에 타입을 붙였다. 파생값 무변경 — calc-bridge 골든([4b])이 같은 값을 낸다.
// 옛 경로 core/semco-derive.js는 이 파일을 re-export하는 shim(gen-salary-pages·check-calc-drift가 그대로 돈다).
// 연도 키·근무개월·연도별 연봉은 하이닉스와 같은 규칙이라 hynix/derive.ts의 함수를 이름만 바꿔 내보낸다 — 두 벌을 두지 않는다.
//
// 이 파일이 아는 것: 연도별 영업이익 키와 기본값, 그리고 calc-bridge.calcSemco를 **첫해 조건으로 정규화해** 부르는 calcSemcoResult.
// 이 파일이 모르는 것: 화면. 재배열·합산은 result-view.ts가.
import { calcSemco } from '../../calc-bridge.js';
import { HYNIX_YEARS, getActiveHynixYears, getHynixOp, getHynixWorkMonths, getHynixYearSalary, hynixOpKey } from '../hynix/derive.ts';
import { SDI, SEMCO, type OpiTaiCompany } from './companies.ts';
import type { SemcoInputs, SemcoResult } from './types.ts';

export type { SemcoInputs, SemcoOpKey, SemcoResult, SemcoGrade } from './types.ts';
export { OPI_TAI_COMPANIES, SDI, SEMCO } from './companies.ts';
export type { OpiTaiCompany } from './companies.ts';

export const SEMCO_YEARS: number[] = HYNIX_YEARS;

/** 그 회사의 첫 진입 입력 — 회사별로 다른 값은 companies.ts 하나에서만 온다 */
export function opiTaiDefaults(co: OpiTaiCompany): SemcoInputs {
  const opAt = (year: number) => co.opDefaults[year] ?? co.opDefaults[co.opFallbackYear];
  return {
    grade: co.base.grade,
    salary: co.base.salary,
    avgSalary: co.base.avgSalary,
    headcount: co.base.headcount,
    months: 12,
    h1: co.base.h1,
    h2: co.base.h2,
    taxRate: null,
    accumGrowth: 5,
    accumYears: 5,   // 기본 5개년(사용자 2026-09-10)
    accumSalaryOverrides: {},
    workMonthsByYear: {},
    ...Object.fromEntries(SEMCO_YEARS.map(year => [hynixOpKey(year), opAt(year)])),
    opTril: opAt(SEMCO_YEARS[0]),
  };
}

/** 연도별 영업이익 기본 가정(조) — 2026 1.64 … 장기 가정. 이름은 소비처가 물고 있어 그대로 둔다 */
export const SEMCO_OP_DEFAULTS: Record<number, number> = { ...SEMCO.opDefaults };

export const SEMCO_DEFAULTS: SemcoInputs = opiTaiDefaults(SEMCO);
export const SDI_DEFAULTS: SemcoInputs = opiTaiDefaults(SDI);

export {
  getActiveHynixYears as getActiveSemcoYears,
  getHynixWorkMonths as getSemcoWorkMonths,
  getHynixOp as getSemcoOp,
  getHynixYearSalary as getSemcoYearSalary,
  hynixOpKey as semcoOpKey,
};

/**
 * 한 해 결과 — calcSemco를 **첫해 조건으로 정규화해** 부른다(하이닉스 calcHynixResult와 같은 이유).
 * 연도별 표(accumSalaryOverrides[첫해] · workMonthsByYear[첫해])가 salary·months와 어긋나지 않게 해서
 * "히어로 = 3개년 표 첫 행"이 구성으로 성립한다.
 */
export function calcSemcoResult(inputs: SemcoInputs): SemcoResult {
  const first = getActiveHynixYears(inputs)[0] ?? SEMCO_YEARS[0];
  return calcSemco({
    ...inputs,
    salary: getHynixYearSalary(inputs, first),
    months: getHynixWorkMonths(inputs, first),
    opTril: getHynixOp(inputs, first),
  } as unknown as Parameters<typeof calcSemco>[0]) as SemcoResult;
}
