import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleRecord, perQuestionRecord, perShotRecord, archeryShotRing, perQuestionTotals } from '../js/core/sceneResults.js';

test('묶음 종목 : S가 큰 팀의 기록이 항상 더 좋고, 차이가 클수록 기록 차이도 큼 (줄다리기 최대 2.0m)', () => {
  for (const sport of ['tug', 'skijump', 'skeleton', 'longjump']) {
    let prevGap = -1;
    for (const [a, b] of [[300, 299], [300, 250], [300, 150], [450, 0]]) {
      const r = bundleRecord(sport, { rabbit: a, cat: b });
      assert.equal(r.winner, 'rabbit');
      const ra = r.result.rabbit.value, rb = r.result.cat.value;
      if (sport === 'skeleton') assert.ok(ra < rb, sport); else assert.ok(ra > rb, sport);
      const gap = Math.abs(ra - rb); assert.ok(gap > prevGap, `${sport} gap ${gap} > ${prevGap}`); prevGap = gap;
    }
    const d = bundleRecord(sport, { rabbit: 200, cat: 200 }); assert.equal(d.winner, 'draw'); assert.equal(d.result.rabbit.value, d.result.cat.value);
  }
  const t = bundleRecord('tug', { rabbit: 450, cat: 0 }); assert.equal(t.result.rabbit.value, 2); assert.equal(t.result.cat.value, -2); assert.equal(t.finish, true); assert.equal(t.result.cat.fail, true);
  assert.equal(bundleRecord('tug', { rabbit: 0, cat: 0 }).result.rabbit.value, 0);
  assert.equal(bundleRecord('skijump', { rabbit: 450, cat: 0 }).result.rabbit.value, 139);
  assert.equal(bundleRecord('skeleton', { rabbit: 0, cat: 450 }).result.cat.value, 55.5);
  assert.equal(bundleRecord('longjump', { rabbit: 450, cat: 225 }).result.rabbit.value, 8);
});

test('양궁(발별, 2문항=1발, 20점 과녁) : Tsum이 큰 팀 ring 승, 진 팀은 1점 낮음', () => {
  // 15점 간격: Tsum=300 → 20, Tsum=285 → 19, Tsum=0 → 1 (최저)
  assert.equal(archeryShotRing(300), 20); assert.equal(archeryShotRing(285), 19); assert.equal(archeryShotRing(150), 10); assert.equal(archeryShotRing(15), 1); assert.equal(archeryShotRing(0), 1); assert.equal(archeryShotRing(1), 1);
  // 2문항 합(0~300) → ring. 승 팀 ring, 진 팀 ring-1 (최소 1)
  const r1 = perShotRecord('archery', { rabbit: 300, cat: 0 }, 'rabbit');
  assert.equal(r1.result.rabbit.value, 20); assert.equal(r1.result.rabbit.label, '20');
  assert.equal(r1.result.cat.value, 19); assert.equal(r1.result.cat.fail, true);
  const r2 = perShotRecord('archery', { rabbit: 100, cat: 180 }, 'cat');
  assert.equal(r2.result.cat.value, 12); assert.equal(r2.result.rabbit.value, 11);
  // 두 팀 모두 T=0 → 1점/1점 (진 팀 최소 1점 보장)
  const r0 = perShotRecord('archery', { rabbit: 0, cat: 0 }, 'draw');
  assert.equal(r0.result.rabbit.value, 1); assert.equal(r0.result.cat.value, 1);
  // 합계 차이 = 발 승 수 차 × 1점 간격
  const recs = [perShotRecord('archery', { rabbit: 300, cat: 50 }, 'rabbit'),
    perShotRecord('archery', { rabbit: 100, cat: 200 }, 'cat'),
    perShotRecord('archery', { rabbit: 250, cat: 90 }, 'rabbit')];
  const tot = perQuestionTotals(recs); assert.equal(tot.rabbit - tot.cat, 1 * (2 - 1));
});

test('사격(문항별) : 이긴 팀 기록이 더 좋고, 합계 차이 = 이긴 문항 수 차이 × 간격 (T=0 포함)', () => {
  const p = [perQuestionRecord('pistol', { rabbit: 150, cat: 0 }, 'rabbit'), perQuestionRecord('pistol', { rabbit: 0, cat: 50 }, 'cat'), perQuestionRecord('pistol', { rabbit: 100, cat: 20 }, 'rabbit')];
  assert.equal(p[0].result.rabbit.value, 10.9); assert.equal(p[0].result.cat.value, 10.5);
  const pt = perQuestionTotals(p); assert.equal(Math.round((pt.rabbit - pt.cat) * 10) / 10, 0.4 * (2 - 1));
  const d = perQuestionRecord('pistol', { rabbit: 0, cat: 0 }, 'draw'); assert.equal(d.result.rabbit.value, d.result.cat.value); assert.equal(d.result.rabbit.value, 10);
  // 양궁은 perQuestionRecord에서 더 이상 지원되지 않음(perShot 사용)
  assert.throws(() => perQuestionRecord('archery', { rabbit: 150, cat: 0 }, 'rabbit'), /문항별 종목이 아님/);
});
