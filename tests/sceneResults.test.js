import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleRecord, perQuestionRecord, archeryRing, perQuestionTotals } from '../js/core/sceneResults.js';

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

test('문항별 종목 : 이긴 팀 기록이 더 좋고, 합계 차이 = 이긴 문항 수 차이 × 간격 (T=0 포함)', () => {
  assert.equal(archeryRing(140), 'X'); assert.equal(archeryRing(120), '10'); assert.equal(archeryRing(80), '9'); assert.equal(archeryRing(10), '8');
  const recs = [perQuestionRecord('archery', { rabbit: 145, cat: 0 }, 'rabbit'), perQuestionRecord('archery', { rabbit: 90, cat: 100 }, 'cat'), perQuestionRecord('archery', { rabbit: 130, cat: 60 }, 'rabbit')];
  assert.equal(recs[0].result.rabbit.label, 'X'); assert.equal(recs[0].result.rabbit.value, 10); assert.equal(recs[0].result.cat.value, 9); assert.equal(recs[0].result.cat.fail, true);
  const tot = perQuestionTotals(recs); assert.equal(tot.rabbit - tot.cat, 1 * (2 - 1));
  const p = [perQuestionRecord('pistol', { rabbit: 150, cat: 0 }, 'rabbit'), perQuestionRecord('pistol', { rabbit: 0, cat: 50 }, 'cat'), perQuestionRecord('pistol', { rabbit: 100, cat: 20 }, 'rabbit')];
  assert.equal(p[0].result.rabbit.value, 10.9); assert.equal(p[0].result.cat.value, 10.5);
  const pt = perQuestionTotals(p); assert.equal(Math.round((pt.rabbit - pt.cat) * 10) / 10, 0.4 * (2 - 1));
  const d = perQuestionRecord('pistol', { rabbit: 0, cat: 0 }, 'draw'); assert.equal(d.result.rabbit.value, d.result.cat.value); assert.equal(d.result.rabbit.value, 10);
  const da = perQuestionRecord('archery', { rabbit: 125, cat: 125 }, 'draw'); assert.equal(da.result.rabbit.label, '10'); assert.equal(da.result.cat.label, '10');
});
