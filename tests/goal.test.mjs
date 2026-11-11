import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAbilities, parseRatings, addRating, renderRatings } from '../scripts/goal.mjs';

const A = loadAbilities();

test('abilities: 8項目、目安は 1/4/7/10、phases は 1〜4', () => {
  assert.equal(A.items.length, 8);
  assert.deepEqual(Object.keys(A.scale), ['1', '4', '7', '10']);
  for (const i of A.items) assert.ok(i.phases.every((p) => p >= 1 && p <= 4), i.id);
});

test('addRating: 整数 1〜10 と知っている項目だけ受け付ける', () => {
  for (const bad of [{ prompt: 0 }, { prompt: 11 }, { prompt: 5.5 }, { prompt: 'x' }, { zzz: 5 }, {}]) {
    assert.throws(() => addRating([], bad, '2026-11-11', A), JSON.stringify(bad));
  }
});

test('addRating: 同じ日は置き換え、別の日は追加', () => {
  const a = addRating([], { prompt: 3 }, '2026-11-11', A);
  const b = addRating(a, { prompt: 5, github: 2 }, '2026-11-11', A);
  assert.deepEqual(b, [{ date: '2026-11-11', values: { prompt: 5, github: 2 } }]);
  assert.equal(addRating(b, { prompt: 6 }, '2026-12-11', A).length, 2);
});

test('parseRatings: 壊れた内容、不正な日付、範囲外の値は捨てる', () => {
  assert.deepEqual(parseRatings(null), []);
  assert.deepEqual(parseRatings('{'), []);
  assert.deepEqual(parseRatings('[{"date":"2026-02-30","values":{"prompt":3}},{"date":"2026-11-11","values":{"prompt":12,"github":4}}]'), [{ date: '2026-11-11', values: { github: 4 } }]);
});

test('renderRatings: 前回の値と並べ、答えていない項目は空', () => {
  const log = [{ date: '2026-10-11', values: { prompt: 3, github: 5 } }, { date: '2026-11-11', values: { prompt: 6 } }];
  const text = renderRatings(log, A);
  assert.ok(text.includes('AIの答えが思ったものと違ったとき、頼み方を変えて出し直せる 6(前回 3)'));
  assert.ok(text.includes('作業の途中を保存しておき、うまくいかなかったら前の状態に戻せる -(前回 5)'));
  assert.ok(text.includes('毎週、実際の仕事の一部をAIに任せている -(前回 なし)'));
  assert.ok(!/合計|平均/.test(text));
});

test('renderRatings: 記録が無ければ目安を案内する', () => {
  assert.ok(renderRatings([], A).includes('1 やったことがない'));
});
