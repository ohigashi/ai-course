import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKS_FILE, parseWorks, defaultWorks, workPath, syncRounds, roundCount } from '../scripts/works.mjs';

const done = (...ids) => ({ stages: [0,1,2,3,4,5,6,7].map((id) => ({ id, done: ids.includes(id), missing: [] })), currentStage: null });
const base = { slug: 'w1', name: 'a', phase: 2, state: 'active', next: '', rounds: [], startedAt: '2026-11-09', touchedAt: '2026-11-09' };

test('WORKS_FILE', () => assert.equal(WORKS_FILE, 'works.json'));
test('workPath: main はそのまま、それ以外は works/ の下', () => {
  assert.equal(workPath('main', 'docs/01-problem.md'), 'docs/01-problem.md');
  assert.equal(workPath('w2', 'docs/01-problem.md'), 'works/w2/docs/01-problem.md');
});
test('parseWorks: 形の違う項目と危険な slug を捨てる', () => {
  const text = JSON.stringify({ items: [base, { ...base, slug: '../x' }, { ...base, slug: 'w2', phase: 9 }, { ...base, slug: 'w3', state: 'x' }] });
  assert.deepEqual(parseWorks(text).map((w) => w.slug), ['w1']);
});
test('parseWorks: ファイルなしは空、壊れていれば null', () => {
  assert.deepEqual(parseWorks(null), []);
  assert.equal(parseWorks('{'), null);
});
test('parseWorks: 重複 slug は最初だけ残す', () => {
  const text = JSON.stringify({ items: [base, { ...base, name: 'second' }] });
  const r = parseWorks(text);
  assert.equal(r.length, 1);
  assert.equal(r[0].name, 'a');
});
test('parseWorks: 空白を詰めて120字に切り、件数は20まで', () => {
  const long = { ...base, name: ' a\n  b ' + 'x'.repeat(200), next: 'y'.repeat(300) };
  const [w] = parseWorks(JSON.stringify({ items: [long] }));
  assert.ok(w.name.startsWith('a b x'));
  assert.equal(w.name.length, 120);
  assert.equal(w.next.length, 120);
  const many = Array.from({ length: 30 }, (_, i) => ({ ...base, slug: `w${i + 1}` }));
  assert.equal(parseWorks(JSON.stringify({ items: many })).length, 20);
});
test('parseWorks: 不正な rounds と日付を捨てる', () => {
  const bad = { ...base, rounds: [{ phase: 1, date: '2026-11-09' }, { phase: 5, date: '2026-11-09' }, { phase: 1, date: '2026-13-40' }], startedAt: 'nope' };
  assert.equal(parseWorks(JSON.stringify({ items: [bad] })).length, 0);
  const okStart = { ...bad, startedAt: '2026-11-09' };
  assert.deepEqual(parseWorks(JSON.stringify({ items: [okStart] }))[0].rounds, [{ phase: 1, date: '2026-11-09' }]);
});
test('defaultWorks: 既存の受講者は main がフェーズ3で、1と2が各1回', () => {
  const [w] = defaultWorks(done(0,1,2,3,4,5), '2026-11-09');
  assert.equal(w.slug, 'main');
  assert.equal(w.name, '最初の取り組み');
  assert.equal(w.phase, 3);
  assert.equal(roundCount(w, 1), 1);
  assert.equal(roundCount(w, 2), 1);
});
test('defaultWorks: 小さな自動化が未完ならフェーズ1、回数は0', () => {
  const [w] = defaultWorks(done(0), '2026-11-09');
  assert.equal(w.phase, 1);
  assert.equal(roundCount(w, 1), 0);
});
test('defaultWorks: 段階2済みで1,3,4,5のどれか未完ならフェーズ2', () => {
  const [w] = defaultWorks(done(0,2,1,3,4), '2026-11-09');
  assert.equal(w.phase, 2);
  assert.equal(roundCount(w, 1), 1);
  assert.equal(roundCount(w, 2), 0);
});
test('syncRounds: 判定が通った初回だけ回数を足し、同じ回は足さない', () => {
  const w = { ...base, phase: 1, startedAt: 'x', touchedAt: 'x' };
  const evaluated = [{ slug: 'w1', checks: { 1: { done: true, missing: [] }, 2: { done: false, missing: ['y'] } } }];
  const once = syncRounds([w], evaluated, '2026-11-09');
  assert.deepEqual(once[0].rounds, [{ phase: 1, date: '2026-11-09' }]);
  assert.deepEqual(syncRounds(once, evaluated, '2026-11-10')[0].rounds, once[0].rounds);
});
test('syncRounds: 判定のない取り組みは変えない', () => {
  const w = { ...base };
  assert.deepEqual(syncRounds([w], [], '2026-11-09'), [w]);
});
test('parseWorks: フェーズ4の取り組みと、フェーズ3・4の回を残し、5は捨てる', () => {
  const r3 = { phase: 3, date: '2026-11-09' };
  const r4 = { phase: 4, date: '2026-11-09' };
  const kept = parseWorks(JSON.stringify({ items: [{ ...base, phase: 4, rounds: [r3, r4, { phase: 5, date: '2026-11-09' }] }] }));
  assert.equal(kept[0].phase, 4);
  assert.deepEqual(kept[0].rounds, [r3, r4]);
  assert.equal(parseWorks(JSON.stringify({ items: [{ ...base, phase: 5 }] })).length, 0);
});
