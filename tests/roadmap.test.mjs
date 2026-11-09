import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderRoadmap, statusLine, loadRoadmap } from '../scripts/roadmap.mjs';
import { loadPhases } from '../scripts/phases.mjs';

const P = loadPhases();
const r = (currentStage, doneIds) => ({ currentStage, stages: [0,1,2,3,4,5,6,7].map((id) => ({ id, done: doneIds.includes(id), missing: doneIds.includes(id) ? [] : ['未完了'] })) });

test('コースの全体は基本の6段階と並行のチームで作る', () => {
  assert.deepEqual(loadRoadmap().map((s) => s.title), ['環境づくり', '課題の洗い出し', '小さな自動化', 'プロダクト化', 'アプリ開発', '公開と運用', 'チームで作る', '課題解決とプロダクト']);
});
test('地図: 4つを縦に並べ、今のフェーズだけ開く', () => {
  const lines = renderRoadmap(r(4, [0,1,2,3]), P).split('\n');
  assert.equal(lines[0], '済 1 作ってみる');
  assert.equal(lines[1], '今 2 課題からアプリを作る');
  assert.equal(lines[2], '     次にやること: 未完了');
  assert.equal(lines[3], `     作りながら分かること: ${P[1].learn}`);
  assert.equal(lines[4], '- 3 繰り返して慣れる、たくさん作る');
  assert.equal(lines[5], '可 4 人の課題も解決する(参加できます)');
});
test('画面の下の1行', () => {
  assert.equal(statusLine(r(null, [0,1,2,3,4,5]), P), 'フェーズ3/4 繰り返して慣れる、たくさん作る | 次: /challenge で次の課題に取り組む');
});
