import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPhases, phaseOfStage, nextActionOf } from '../scripts/phases.mjs';

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
test('nextActionOf: 残りの先頭、全部終えたら /challenge、それも終えたらフェーズの案内', () => {
  assert.equal(nextActionOf(r(2, [0,1])), '未完了');
  assert.equal(nextActionOf(r(null, [0,1,2,3,4,5])), '/challenge で次の課題に取り組む');
  assert.match(nextActionOf(r(null, [0,1,2,3,4,5,7])), /^フェーズ1と2を終えました/);
});

test('nextActionOf: 環境づくりが未完なら、取り組みより先に段階0の残りを返す', () => {
  const stages = [{ id: 0, done: false, missing: ['CLAUDE.md を自分の言葉で書く'] }, { id: 2, done: false, missing: ['work/ に作ったものを保存する'] }];
  const works = [{ slug: 'main', state: 'active', next: '別の作業', nextAction: '別の作業' }];
  assert.equal(nextActionOf({ stages, currentStage: 0, setupDone: false, works }), 'CLAUDE.md を自分の言葉で書く');
  assert.equal(nextActionOf({ stages, currentStage: 2, setupDone: false, works }), 'CLAUDE.md を自分の言葉で書く');
  assert.equal(nextActionOf({ stages, currentStage: 0, works }), 'CLAUDE.md を自分の言葉で書く');
  assert.equal(nextActionOf({ stages, currentStage: 2, works }), '別の作業');
  assert.equal(nextActionOf({ stages, currentStage: 2, setupDone: true, works }), '別の作業');
});
