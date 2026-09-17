// core/bonus/compare/compare-view.ts — ㉑ 두 회사 비교(캔버스 CompareTwo)의 뷰 모델: 같은 계약연봉이면 어느 쪽이 더 받는지, 그 차이가 어디서 오는지.
//
// 계산하지 않는다 — 삼성·하이닉스 뷰 모델(result-view.ts)이 이미 낸 값을 **한 표에 나란히** 놓고 비율을 낸다. 두 회사가 같은 자(세후·소득세 기준 ·
// "올해 손에 들어오는 돈" = 삼성 cashableNow · 하이닉스 hero.total)로 잰다는 것이 이 파일의 전부다.
// 유일한 재계산은 "삼성 영업이익을 하이닉스와 같게 두면"(sameOp) — 다른 입력으로 derive를 다시 부르는 것뿐(curve.ts와 같은 방식)이고, 원인 설명용이다.
// 단위: 금액 만원 정수 · 영업이익 조 · 비율 0~1.
import { SAMSUNG_DEFAULTS, calcSamsungResult, getYearOps, opKeys } from '../samsung/derive.ts';
import { buildSamsungResultView } from '../samsung/result-view.ts';
import { HYNIX_DEFAULTS, calcHynixResult } from '../hynix/derive.ts';
import { buildHynixResultView } from '../hynix/result-view.ts';
import { payoutShape } from './payout-shape.ts';
import type { PayoutShape } from './payout-shape.ts';
import type { SamsungInputs } from '../samsung/types.ts';
import type { HynixInputs, HynixPayoutPlan } from '../hynix/types.ts';

export interface CompareSide {
  key: 'samsung' | 'hynix';
  label: string;
  sub: string | null;           // 삼성 '메모리'
  opT: number;                  // 삼성 DS 합계 · 하이닉스 전사(공시)
  opNote: string;               // 무엇을 더한 값인지
  poolLabel: string;            // 재원 산식 한 줄
  headcount: number;            // 나눠 갖는 인원
  perHeadOp: number;            // 만원 — 재원 기준 영업이익 ÷ 인원(하이닉스는 재원 차감 후 값)
  rate: number;                 // 세전 성과급 ÷ 계약연봉(0~1) — 삼성 OPI+TAI+특별성과급 · 하이닉스 PS+PI
  cash: number;                 // 세후 현금 — 삼성 OPI+TAI · 하이닉스 PS 현금분
  pi: number | null;            // 하이닉스만 — PI 현금
  vestedNow: number;            // 올해 풀리는 자사주(세후 평가)
  received: number;             // 올해 손에 들어오는 돈 = cash + (pi ?? 0) + vestedNow
  later: number;                // 나중에 풀리는 몫 — 삼성 2·3년차 주식 · 하이닉스 이연 20% 주식(올해 실효세율로 근사)
  shape: PayoutShape;
}

export interface CompareTwoView {
  salary: number;
  year: number;
  samsung: CompareSide;
  hynix: CompareSide;
  winner: 'samsung' | 'hynix' | 'even';
  ratio: number | null;         // 큰 쪽 ÷ 작은 쪽(소수 둘째 자리) · 한쪽이 0이면 null
  diff: number;                 // |삼성 − 하이닉스| (만원)
  perHeadRatio: number | null;  // 하이닉스 1인당 ÷ 삼성 1인당
  rateRatio: number | null;     // 하이닉스 지급률 ÷ 삼성 지급률
  sameOp: { opMem: number; dsOpT: number; samsungReceived: number } | null;   // 삼성 DS 합계를 하이닉스 전사 OP와 같게 두면
  hynixPlan: HynixPayoutPlan | null;
}

export interface CompareParams {
  salary?: number | null;                     // 같은 계약연봉(만원) — 없으면 두 계산기 기본값 5,600
  samCms?: Partial<SamsungInputs> | null;     // 운영 가정값(App이 넘긴다)
  hxCms?: Partial<HynixInputs> | null;
  /** 주가 봇의 전일 종가(원). 없으면 코드 기본값 — 그건 낡을 수 있는 값이다.
   *  CMS로 섞어 넣지 않고 따로 받는다: `samCms`는 Supabase 운영 가정값이고 이건 봇 산출물이라
   *  출처가 다르다. 한 통로로 합치면 어느 쪽이 틀렸는지 못 가른다(§2 · fetchedAt 사고와 같은 계열). */
  samStockPrice?: number | null;
  hxStockPrice?: number | null;
}

const round = (n: number) => Math.round(n);
const EVEN_BAND = 100;   // 만원 — 이 안이면 '비슷하다'

export function buildCompareTwoView({ salary = null, samCms = null, hxCms = null, samStockPrice = null, hxStockPrice = null }: CompareParams = {}): CompareTwoView {
  // 주가는 **있을 때만** 덮는다. 없으면 코드 기본값이 남는데, 그건 '틀린 값'이 아니라
  // '오래된 값'이라 화면이 계속 도는 편이 낫다(§2 미노출 원칙은 출처 없는 값에 적용된다).
  const stockOf = (v: number | null) => (Number.isFinite(v as number) && (v as number) > 0 ? { stockPrice: v } : {});
  const sal = salary != null && Number(salary) > 0 ? round(Number(salary)) : Number(SAMSUNG_DEFAULTS.salary);
  const year = 2026;

  // ── 삼성전자 메모리 · 연봉제 일반 ──
  const sIn: SamsungInputs = { ...SAMSUNG_DEFAULTS, ...(samCms || {}), ...stockOf(samStockPrice), salary: sal, year, grade: 'cl4-low' } as SamsungInputs;
  const sRes = calcSamsungResult(sIn);
  const sv = buildSamsungResultView({ inputs: sIn, results: sRes, dept: 'mem' });
  const d = sRes.deptResults.mem;
  const ops = getYearOps(sIn, year);
  const sHead = ['hMem', 'hCom', 'hFnd', 'hLsi'].reduce((a, k) => a + (Number((sIn as unknown as Record<string, unknown>)[k]) || 0), 0);
  const sGrossPre = d.opiPre + d.spPre + sv.formula.tai.pre;
  const samsung: CompareSide = {
    key: 'samsung', label: '삼성전자', sub: '메모리',
    opT: sv.formula.premise.dsOpT,
    opNote: `DS 합계 — 메모리 ${ops.mem} + 파운드리 ${ops.fnd} + 시스템LSI ${ops.lsi}`,
    poolLabel: '영업이익 × 10%',
    headcount: sHead,
    perHeadOp: sHead > 0 ? round(sv.formula.premise.dsOpT * 1e8 / sHead) : 0,
    rate: sal > 0 ? sGrossPre / sal : 0,
    cash: sv.hero.cash, pi: null, vestedNow: sv.grant.vestedNow.val,
    received: sv.cashableNow, later: sv.grant.later.val,
    shape: payoutShape(sv.hero.cash, sv.grant.vestedNow.val, sv.grant.later.val),
  };

  // ── SK하이닉스 전사 ──
  const hIn: HynixInputs = { ...HYNIX_DEFAULTS, ...(hxCms || {}), ...stockOf(hxStockPrice), salary: sal } as HynixInputs;
  const hRes = calcHynixResult(hIn);
  const hv = buildHynixResultView({ inputs: hIn, results: hRes, samCms });
  const hHead = hv.condition.headcount;
  const hynix: CompareSide = {
    key: 'hynix', label: 'SK하이닉스', sub: null,
    opT: hv.condition.opT,
    opNote: '전사 — 공시 영업이익',
    poolLabel: `영업이익 × ${(hv.formula.pool.effRate * 100).toFixed(2).replace(/\.?0+$/, '')}%`,
    headcount: hHead,
    perHeadOp: hHead > 0 ? round((hv.condition.opT - hv.formula.pool.poolT) * 1e8 / hHead) : 0,
    rate: hRes.grossRate,
    cash: hv.hero.psCash, pi: hv.hero.pi, vestedNow: hv.hero.psStock,
    received: hv.hero.total, later: hv.hero.deferredPost,
    shape: hv.shape.hynix,
  };

  // ── 결론 ──
  const a = samsung.received, b = hynix.received;
  const diff = Math.abs(a - b);
  const winner: CompareTwoView['winner'] = diff < EVEN_BAND ? 'even' : a > b ? 'samsung' : 'hynix';
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const ratio = lo > 0 ? Math.round(hi / lo * 100) / 100 : null;
  const perHeadRatio = samsung.perHeadOp > 0 ? Math.round(hynix.perHeadOp / samsung.perHeadOp * 100) / 100 : null;
  const rateRatio = samsung.rate > 0 ? Math.round(hynix.rate / samsung.rate * 100) / 100 : null;

  // ── 원인 설명: 삼성 DS 합계를 하이닉스 전사 OP와 같게 두면(메모리만 바꾼다) ──
  let sameOp: CompareTwoView['sameOp'] = null;
  if (hynix.opT > 0) {
    const opMem = Math.round((hynix.opT - ops.fnd - ops.lsi) * 10) / 10;
    const sIn2: SamsungInputs = { ...sIn, [opKeys(year).mem]: opMem } as SamsungInputs;
    const v2 = buildSamsungResultView({ inputs: sIn2, results: calcSamsungResult(sIn2), dept: 'mem' });
    sameOp = { opMem, dsOpT: v2.formula.premise.dsOpT, samsungReceived: v2.cashableNow };
  }

  return { salary: sal, year, samsung, hynix, winner, ratio, diff, perHeadRatio, rateRatio, sameOp, hynixPlan: hv.plan };
}
