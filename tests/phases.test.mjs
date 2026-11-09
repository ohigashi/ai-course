import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPhases, phaseOfStage, phaseMarks, nextActionOf } from '../scripts/phases.mjs';

const P = loadPhases();
const r = (currentStage, doneIds) => ({ currentStage, stages: [0,1,2,3,4,5,6,7].map((id) => ({ id, done: doneIds.includes(id), missing: doneIds.includes(id) ? [] : ['未完了'] })) });
test('フェーズは4つで、段階0〜7を重複なく含む', () => {
  assert.deepEqual(P.map((p) => p.title), ['作ってみる', '課題からアプリを作る', '繰り返して慣れる、たくさん作る', '人の課題も解決する']);
  assert.deepEqual(P.flatMap((p) => p.stages).sort(), [0,1,2,3,4,5,6,7]);
});
test('phaseOfStage: 段階からフェーズを返し、null はフェーズ3', () => {
  assert.equal(phaseOfStage(2, P).id, 1);
  assert.equal(phaseOfStage(1, P).id, 2);
  assert.equal(phaseOfStage(null, P).id, 3);
});
test('phaseMarks: 段階5まで終えた人は3が今、1と2は済', () => {
  assert.deepEqual(phaseMarks(r(null, [0,1,2,3,4,5]), P).map((p) => p.mark), ['済', '済', '今', '可']);
});
test('phaseMarks: 旧順序の途中(1は済、2は未完)は1が今で、2は済にならない', () => {
  assert.deepEqual(phaseMarks(r(2, [0,1]), P).slice(0, 2).map((p) => p.mark), ['今', '-']);
});
test('phaseMarks: フェーズ4は段階0,1,2を終えるまで参加できない', () => {
  const [, , , four] = phaseMarks(r(1, [0,2]), P);
  assert.equal(four.mark, '-');
  assert.equal(four.note, '小さな自動化と課題の選定のあとに参加できます');
  assert.equal(phaseMarks(r(3, [0,1,2]), P)[3].note, '参加できます');
});
test('phaseMarks: 判定にない段階を含むフェーズは済にしない', () => {
  assert.equal(phaseMarks({ currentStage: null, stages: [{ id: 0, done: true, missing: [] }] }, P)[0].mark, '-');
});
test('nextActionOf: 残りの先頭、全部終えたら /challenge、それも終えたらフェーズの案内', () => {
  assert.equal(nextActionOf(r(2, [0,1])), '未完了');
  assert.equal(nextActionOf(r(null, [0,1,2,3,4,5])), '/challenge で次の課題に取り組む');
  assert.match(nextActionOf(r(null, [0,1,2,3,4,5,7])), /^フェーズ1と2を終えました/);
});
