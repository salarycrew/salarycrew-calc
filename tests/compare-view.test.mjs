// compare-view.test.mjs — ㉑ 두 회사 비교 뷰 모델: 두 회사가 **같은 자**로 재어졌는지의 항등식.
// 삼성 '올해 손에' = 삼성 뷰 모델 cashableNow · 하이닉스 '올해 손에' = 하이닉스 뷰 모델 hero.total · received = cash + pi + vestedNow ·
// 막대 % 합 = 100 · ratio = 큰 쪽 ÷ 작은 쪽 · sameOp는 같은 DS 합계를 만든다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompareTwoView } from '../src-react/core/bonus/compare/compare-view.ts';
import { SAMSUNG_DEFAULTS, calcSamsungResult } from '../src-react/core/bonus/samsung/derive.ts';
import { buildSamsungResultView } from '../src-react/core/bonus/samsung/result-view.ts';
import { HYNIX_DEFAULTS, calcHynixResult } from '../src-react/core/bonus/hynix/derive.ts';
import { buildHynixResultView } from '../src-react/core/bonus/hynix/result-view.ts';

// **기본값 골든**이다 — 인자 없이 부르므로 '지금 기본값이 무엇을 내는가'를 적어 두는 것이 이 테스트의 일이다.
// 그래서 운영값(CMS)이 바뀌면 **기대값을 옮긴다**(입력 고정이 아니다 — `0f6b454f`의 분류).
// 2026-09-11: 메모리 2026년 영업이익이 CMS에서 300 → 350조가 되며 삼성 9,558 → 10,728 · 2.28 → 2.03배.
// 2026-09-17: 임단협 가결(9/16)로 **재원이 단순 10%(애드백)로 돌아가고 이연 20%가 복원**됐다 —
// 하이닉스 26,685 → 23,740. 재원은 커졌지만(43,807 → 48,188) 당해 지급이 80%로 줄어 순효과는 감소다.
test('골든: 기본값(5,600만 · 2026 · 삼성 메모리 350 / 하이닉스 256) — 삼성 10,728 · 하이닉스 23,740 · 2.21배', () => {
  const v = buildCompareTwoView();
  assert.equal(v.salary, 5600);
  assert.equal(v.samsung.received, 10728);         // samsung-result-view 골든 cashableNow
  assert.equal(v.hynix.received, 23740);           // hynix-result-view 골든 hero.total
  assert.equal(v.winner, 'hynix');
  assert.equal(v.ratio, 2.21);
  assert.equal(v.samsung.opT, 348);   // 메모리 350 + 파운드리 −1.5 + S.LSI −0.5
  assert.equal(v.hynix.opT, 256);
  assert.equal(v.samsung.headcount, 77400);
  assert.equal(v.hynix.headcount, 35000);
  assert.equal(v.perHeadRatio, 1.46);   // 메모리 350조(2026-09-11) + 하이닉스 이연 복원(2026-09-17)
  assert.equal(v.sameOp.dsOpT, 256);
  assert.equal(v.sameOp.samsungReceived, 8584);
});

test('항등식: 각 쪽 received = cash + pi + vestedNow · 삼성 = 삼성 뷰 모델 cashableNow · 하이닉스 = 하이닉스 hero.total', () => {
  for (const salary of [5600, 3000, 12000]) {
    const v = buildCompareTwoView({ salary });
    assert.equal(v.samsung.received, v.samsung.cash + (v.samsung.pi ?? 0) + v.samsung.vestedNow);
    assert.equal(v.hynix.received, v.hynix.cash + (v.hynix.pi ?? 0) + v.hynix.vestedNow);
    // **고정하지 않는다** — 이건 항등식이라 비교 뷰와 삼성 뷰가 *같은 입력*을 써야 한다.
    // 한쪽만 300에 묶었더니 다른 쪽 기본값(350)과 어긋나 거짓 실패가 났다(2026-09-11).
    const sIn = { ...SAMSUNG_DEFAULTS, salary, year: 2026, grade: 'cl4-low' };
    const sv = buildSamsungResultView({ inputs: sIn, results: calcSamsungResult(sIn), dept: 'mem' });
    assert.equal(v.samsung.received, sv.cashableNow);
    assert.equal(v.samsung.later, sv.grant.later.val);
    const hIn = { ...HYNIX_DEFAULTS, salary };
    const hv = buildHynixResultView({ inputs: hIn, results: calcHynixResult(hIn) });
    assert.equal(v.hynix.received, hv.hero.total);
    assert.equal(v.hynix.pi, hv.hero.pi);
  }
});

test('항등식: 막대 % 합 = 100 · ratio = max ÷ min · diff = |a − b| · 비슷하면 even', () => {
  const v = buildCompareTwoView();
  for (const s of [v.samsung, v.hynix]) {
    assert.equal(s.shape.pct.cash + s.shape.pct.vestedNow + s.shape.pct.later, 100);
    assert.equal(s.shape.total, s.shape.cash + s.shape.vestedNow + s.shape.later);
  }
  const lo = Math.min(v.samsung.received, v.hynix.received), hi = Math.max(v.samsung.received, v.hynix.received);
  assert.equal(v.ratio, Math.round(hi / lo * 100) / 100);
  assert.equal(v.diff, hi - lo);
  // CMS로 하이닉스 영업이익을 낮춰 삼성과 비슷하게 만들면 even 밴드에 들어올 수 있다 — 밴드 규칙 자체를 검사
  const near = buildCompareTwoView({ hxCms: { opTril: 112 } });
  assert.ok(['even', 'samsung', 'hynix'].includes(near.winner));
  if (near.diff < 100) assert.equal(near.winner, 'even');
});

test('sameOp: 삼성 DS 합계를 하이닉스 전사 OP와 같게 두면 — 메모리만 바뀌고 DS 합계 = 하이닉스 OP · 그 OP의 삼성 뷰 모델 cashableNow와 같다 · 허들 아래면 자사주 0', () => {
  const v = buildCompareTwoView();
  assert.equal(v.sameOp.dsOpT, v.hynix.opT);
  assert.ok(v.sameOp.samsungReceived < v.samsung.received);
  const sIn = { ...SAMSUNG_DEFAULTS, salary: 5600, year: 2026, grade: 'cl4-low', opMem2026: v.sameOp.opMem };
  const sv = buildSamsungResultView({ inputs: sIn, results: calcSamsungResult(sIn), dept: 'mem' });
  assert.equal(v.sameOp.samsungReceived, sv.cashableNow);
  const low = buildCompareTwoView({ hxCms: { opTril: 150 } });
  assert.equal(low.sameOp.dsOpT, 150);
  const lIn = { ...sIn, opMem2026: low.sameOp.opMem };
  const lv = buildSamsungResultView({ inputs: lIn, results: calcSamsungResult(lIn), dept: 'mem' });
  assert.equal(lv.grant.shares, 0);                            // 허들 200 아래 — 자사주 0
  assert.equal(low.sameOp.samsungReceived, lv.hero.cash);      // OPI+TAI만
});

test('입력: 연봉이 없거나 0이면 기본값 5,600 · CMS 가정값은 각 회사 입력에 섞인다', () => {
  assert.equal(buildCompareTwoView({ salary: 0 }).salary, 5600);
  assert.equal(buildCompareTwoView({ salary: null }).salary, 5600);
  const v = buildCompareTwoView({ samCms: { opMem2026: 250 }, hxCms: { opTril: 300 } });
  assert.equal(v.samsung.opT, 248);
  assert.equal(v.hynix.opT, 300);
});

// ── 주가는 봇 값이 있으면 그걸 쓴다 (2026-09-08) ──────────────────────────────────
// 이 화면만 코드 기본값(SAMSUNG_DEFAULTS.stockPrice = 255,000)으로 계산하고 있었다.
// 결과 화면 둘은 이미 봇의 전일 종가를 쓰는데 여기만 빠져서, 같은 사이트가 같은 회사의
// 자사주를 두 값으로 말했다. CMS(운영 가정값)와 **한 통로로 합치지 않는다** — 출처가 다르다.
test('주가 봇의 종가가 있으면 코드 기본값 대신 그것으로 계산한다', () => {
  const base = buildCompareTwoView({ salary: 5600 });
  const live = buildCompareTwoView({ salary: 5600, samStockPrice: 270000 });
  assert.notEqual(live.samsung.vestedNow, base.samsung.vestedNow, '종가가 다르면 자사주 값도 달라야 한다');

  // 없거나 못 쓸 값이면 조용히 기본값으로 — 화면이 멈추지 않는다
  for (const bad of [null, undefined, 0, -1, NaN]) {
    const v = buildCompareTwoView({ salary: 5600, samStockPrice: bad });
    assert.equal(v.samsung.vestedNow, base.samsung.vestedNow, `${bad}는 기본값으로 떨어진다`);
  }
  // CMS 값이 있어도 봇 종가가 이긴다 — 종가는 사실이고 CMS는 가정이다
  const both = buildCompareTwoView({ salary: 5600, samCms: { stockPrice: 111111 }, samStockPrice: 270000 });
  assert.equal(both.samsung.vestedNow, live.samsung.vestedNow);
});
