// core/bonus/semco/companies.ts — 이 엔진을 쓰는 회사들 (2026-09-18 삼성SDI 추가).
//
// 폴더 이름이 semco인 것은 삼성전기가 먼저였기 때문이다 — **엔진 이름으로 읽어라.**
// 산식이 같은 회사가 둘이 됐다: 영업이익 × 10%를 재원으로 인원·평균연봉으로 지급률을 내고,
// 연봉제 50% 상한 · 이연 없음 · TAI는 반기 지급률. 삼성SDI가 2026-09-10 노사협의회 의결로
// EVA 20% 방식에서 이 방식으로 바꿨다(찬성 93.4% · "내년 초" 적용 = 2026년 실적분).
// 그래서 **회사별로 다른 것은 이 파일의 값뿐**이고 계산(calc-bridge.calcSemco)·뷰 모델·화면은 한 벌이다
// (CLAUDE.md §10 "공용화는 두 번째 반복 뒤에만" — 지금이 그 두 번째다).
//
// 여기 있는 것은 **데이터**다. 제도 상수(재원율 10%·상한 50%)는 calc-bridge가 갖고 있고 여기 나타나면 안 된다.
// 단위: opDefaults·scenarioOps 조원 · salary/avgSalary 만원 · headcount 명 · h1/h2 % 정수.
import type { SemcoGrade } from './types.ts';

export interface OpiTaiCompany {
  key: 'semco' | 'sdi';
  label: string;
  /** 회사 리포트 slug(/company/<slug>) — 결과 화면의 '다음 목적지' 줄이 쓴다 */
  reportSlug: string;
  /** GA screen·이미지 파일명·광고 라벨에 쓰는 짧은 식별자 */
  screen: string;
  /** 본문 광고 슬롯 id — 회사마다 따로 잡는다(애드센스 리포트가 화면별로 갈린다) */
  adSlot: string;
  /** 연도별 영업이익 기본 가정(조) */
  opDefaults: Readonly<Record<number, number>>;
  /** opDefaults에 없는 해에 쓸 기준 연도 */
  opFallbackYear: number;
  /** 시나리오 바의 눈금(조) — 회사 영업이익 규모에 맞춘다 */
  scenarioOps: readonly number[];
  /** 첫 진입 기본 입력 */
  base: {
    grade: SemcoGrade;
    salary: number; monthlySalary: number;   // 연봉제 ↔ 월급제 전환 시의 기본값
    avgSalary: number; headcount: number;
    h1: number; h2: number;
  };
  /** 고급 설정 '연도별 영업이익' 도움말 꼬리 — 기본 가정이 어디서 왔는지 */
  opSourceNote: string;
  /** 결과 화면 '전제' 줄의 회사별 문장 */
  assumeNote: string;
  /** 조건 바 아래 한 줄 — 재원의 범위처럼 화면이 밝혀야 하는 것(없으면 안 붙는다) */
  scopeNote?: string;
  /** TAI 입력 옆 한 줄 — 지급률이 아직 발표되지 않은 반기가 있을 때(없으면 안 붙는다) */
  taiNote?: string;
}

/** 2026 1.64 … 장기 가정 — 2026-09-07 S5b 이전부터의 값 그대로다(무변경) */
const SEMCO_OPS: Record<number, number> = {
  2026: 1.64, 2027: 1.85, 2028: 2.05, 2029: 2.15, 2030: 2.25,
  2031: 2.35, 2032: 2.45, 2033: 2.55, 2034: 2.65, 2035: 2.75,
};

// 삼성SDI 2026E 영업이익 3,895억 = 0.39조 — 네이버 증권 컨센서스(data/companies.json financials est:true).
// **2027년 이후는 컨센서스가 없다.** 그래서 회복 곡선을 지어내지 않고 2026E와 같은 값으로 둔다 —
// "모른다"를 "오른다"로 바꾸지 않는다(§2). 사용자가 고급 설정에서 해마다 직접 넣는다.
const SDI_OPS: Record<number, number> = Object.fromEntries(
  Array.from({ length: 10 }, (_, i) => [2026 + i, 0.39]),
);

export const SEMCO: OpiTaiCompany = {
  key: 'semco',
  label: '삼성전기',
  reportSlug: 'samsung-electro-mechanics',
  screen: 'semco',
  adSlot: '2512572099',
  opDefaults: SEMCO_OPS,
  opFallbackYear: 2028,
  scenarioOps: [1, 1.5, 2, 2.5, 3],
  base: { grade: 'cl4-low', salary: 5600, monthlySalary: 400, avgSalary: 7000, headcount: 12000, h1: 75, h2: 75 },
  opSourceNote: '',
  assumeNote: '재원율·지급률 상한·직급 배율은 삼성전자 OPI 산식을 삼성전기 규모에 적용한 비공식 추정이며, 회사 공식 지급 기준과 다를 수 있습니다.',
};

export const SDI: OpiTaiCompany = {
  key: 'sdi',
  label: '삼성SDI',
  reportSlug: 'samsung-sdi',
  screen: 'sdi',
  adSlot: '2512572099',
  opDefaults: SDI_OPS,
  opFallbackYear: 2026,
  // 0조도 눈금에 둔다 — 2025년 실적분이 실제로 대규모 영업손실이었고 OPI가 전 사업부 0%였다.
  // "영업이익이 없으면 OPI도 없다"를 바 위에서 바로 읽을 수 있어야 한다.
  scenarioOps: [0, 0.5, 1, 1.5, 2],
  // 인원은 DART 사업보고서(2025 귀속 · data/companies.json) 값이다. 평균연봉은 DART 9,498만이 아니라
  // 삼성전기와 같은 7,000만(사용자 2026-09-18 "삼성전기 수준으로") — 같은 엔진을 쓰는 두 회사의 기본 가정을
  // 한 기준으로 맞춘다. DART 평균연봉은 성과급이 섞인 지급 총액이라 재원÷(인원×평균연봉) 지급률의 분모로는
  // 삼성전기도 쓰지 않았다. 고급 설정에서 바꿀 수 있고 화면에 '가정'으로 표시된다.
  // TAI 하반기는 **아직 발표 전**이라 0으로 둔다 — 없는 값을 그럴듯한 숫자로 채우지 않는다(§2).
  base: { grade: 'cl4-low', salary: 5600, monthlySalary: 400, avgSalary: 7000, headcount: 12826, h1: 75, h2: 0 },
  opSourceNote: '2026년은 컨센서스(3,895억)이고 2027년 이후는 컨센서스가 없어 같은 값으로 둔 것입니다',
  assumeNote: '재원은 전사 영업이익 하나를 기준으로 합니다 — 사업부별(중대형전지·소형전지·전자재료) 차등을 말한 보도가 없어 반영하지 않았습니다. 2026-09-10 노사협의회에서 EVA 20% 방식을 영업이익 10%로 바꾸기로 의결했고(찬성 93.4%), 2026년 실적분부터 적용되는 것으로 읽었습니다. 개인 상한은 연봉의 50%이며, 회사 공식 지급 기준과 다를 수 있습니다.',
  scopeNote: '전사 영업이익 기준 · 사업부별 차등 미반영',
  taiNote: '2026년 상반기 TAI는 전 사업부 75%로 확정됐고, 하반기는 아직 발표 전이라 0%로 두었습니다',
};

export const OPI_TAI_COMPANIES = { semco: SEMCO, sdi: SDI } as const;
