// core/bonus/rate/types.ts — '지급률 발표형' 성과급(LG전자·한화에어로·현대차·기아)의 데이터·입출력 계약.
// 단위: 금액 **만원** · 지급률 % (기본급의 N%) · 세율 %(0~100, 옛 계약 그대로).

export interface RateDivision { id: string; label: string; rate: number }
export interface RatePending { status: 'tentative' | string; vote: string; text: string }
export interface RateBreakdown { label: string; value: string }
export interface RateExtra { label: string; why: string }
export interface RateHistory { period: string; top: string; note: string }

export interface RateCompany {
  key: string;
  name: string;
  payName: string;
  asOf: string;
  sourceNote: string;
  fixedMan: number;                  // 전사 정액(만원) — 없으면 0
  fixedLabel: string | null;
  divisions?: RateDivision[];        // 사업부 공지형(LG·한화) — 고르면 지급률이 따라온다
  ratePct?: number;                  // 임단협형(현대차·기아) — 전 조합원 동일 지급률
  basisUnverified?: boolean;         // %의 개인별 산정 기준금액이 공개 합의안에 명시되지 않음
  pending?: RatePending;             // 잠정합의처럼 확정 전 값 — 있으면 결과보다 먼저 알린다
  breakdown?: RateBreakdown[];       // 합의안 항목 내역(표시용)
  extras?: RateExtra[];              // 합의안에 있지만 세후 금액에 안 넣은 것과 이유
  defaults: { division?: string; baseMonthly: number };
  history?: RateHistory[];
}

/** 화면 입력 — null은 "공지값·근사값을 그대로" */
export interface RateInputs {
  division: string | null;           // 사업부 id(공지형만)
  baseMonthly: number | string;      // 월 기본급 또는 회사 공지의 성과금 기준금액(만원)
  rateOverride: number | string | null;   // 직접 고친 지급률(%) · null = 선택 사업부(회사) 공지율
  fixedOverride?: number | string | null; // 직접 고친 정액(만원) · null = 회사 공지 정액('직접 입력'에서만 쓴다)
  annualPay: number | string | null;      // 성과급 제외 연봉(만원) · null = 입력 기준금액 × 14 근사
}

export interface RateResult {
  gross: number;      // 세전 = 입력 기준금액 × 지급률 + 정액
  tax: number;        // 소득세 추정(한계세율)
  net: number;        // 세후
  effTaxPct: number;  // 실효 %(소수 첫째)
}
