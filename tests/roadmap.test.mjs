import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderRoadmap, statusLine, loadRoadmap } from '../scripts/roadmap.mjs';
import { loadPhases } from '../scripts/phases.mjs';

const P = loadPhases();
const w = (over) => ({ slug: 'w1', name: '証憑消込の改善', phase: 2, state: 'active', next: '', rounds: [], touchedAt: '2026-11-09', nextAction: '仕様を書く', ...over });
const base = { setupDone: true, stages: [], currentStage: null };
const none = { stepups: 0, levelsDone: 0, challengeStarted: false, teamStarted: false };

test('コースの全体は基本の6段階と並行のチームで作る', () => {
  assert.deepEqual(loadRoadmap().map((s) => s.title), ['環境づくり', '課題の洗い出し', '小さな自動化', 'プロダクト化', 'アプリ開発', '公開と運用', 'チームで作る', '課題解決とプロダクト']);
});
test('ロードマップに参加の条件は残らない', () => {
  assert.ok(loadRoadmap().every((s) => !('availableAfter' in s)));
});
test('地図: 4つを並べ、各フェーズの下に進めている取り組みをすべて出す', () => {
  const works = [w({}), w({ slug: 'w2', name: '週次レポート', phase: 1, nextAction: '比べる', rounds: [{ phase: 1, date: 'd' }, { phase: 1, date: 'e' }] })];
  const lines = renderRoadmap({ ...base, works }, P, none).split('\n');
  assert.equal(lines[0], '1 作ってみる(これまで 2回)');
  assert.equal(lines[1], '    週次レポート(3回目)');
  assert.equal(lines[2], '      次にやること: 比べる');
  assert.equal(lines[3], `      作りながら分かること: ${P[0].learn}`);
  assert.equal(lines[4], '2 課題からアプリを作る(これまで 0回)');
  assert.equal(lines[5], '    証憑消込の改善');
});
test('地図: 休み中は次にやることを出さない', () => {
  const text = renderRoadmap({ ...base, works: [w({ state: 'paused', rounds: [{ phase: 2, date: 'd' }] })] }, P, none);
  assert.ok(text.includes('    証憑消込の改善(休み中)'));
  assert.ok(!text.includes('次にやること'));
  assert.ok(!text.includes('回目'));
});
test('地図: 発展コースの数は3、課題解決のレベルは4の回数に足し、始めていれば項目が出る', () => {
  const text = renderRoadmap({ ...base, works: [] }, P, { stepups: 2, levelsDone: 1, challengeStarted: true, teamStarted: false });
  assert.ok(text.includes('3 繰り返して慣れる、たくさん作る(これまで 2回)'));
  assert.ok(text.includes('4 人の課題も解決する(これまで 1回)'));
  assert.ok(text.includes('    課題解決\n      次にやること: /challenge で次の課題に取り組む'));
  assert.ok(!text.includes('チームで作る'));
});
test('地図: チームで作るは始めていれば出て、次にやることは付かない', () => {
  const lines = renderRoadmap({ ...base, works: [] }, P, { ...none, teamStarted: true }).split('\n');
  assert.equal(lines.at(-1), '    チームで作る');
});
test('地図: 課題解決のあとにチームで作るが並ぶ', () => {
  const lines = renderRoadmap({ ...base, works: [] }, P, { ...none, challengeStarted: true, teamStarted: true }).split('\n');
  assert.deepEqual(lines.slice(-3), ['    課題解決', '      次にやること: /challenge で次の課題に取り組む', '    チームで作る']);
});
test('地図: 取り組みの回数は同じフェーズの回数だけを数える', () => {
  const text = renderRoadmap({ ...base, works: [w({ rounds: [{ phase: 1, date: 'd' }] })] }, P, none);
  assert.ok(text.includes('    証憑消込の改善\n'));
  assert.ok(text.includes('1 作ってみる(これまで 1回)'));
});
test('地図: 環境づくりが未完なら先頭に案内を出し、地図が続く', () => {
  const text = renderRoadmap({ ...base, setupDone: false, works: [], stages: [{ id: 0, done: false, missing: ['CLAUDE.md を書く'] }], currentStage: 0 }, P, none);
  const lines = text.split('\n');
  assert.equal(lines[0], 'はじめに: 環境づくりとデータの決まりを終えます。次: CLAUDE.md を書く');
  assert.equal(lines[1], '1 作ってみる(これまで 0回)');
});
test('画面の下の1行: 件数と最後に作業した取り組み', () => {
  const works = [w({ touchedAt: '2026-11-01', name: 'A', phase: 1 }), w({ slug: 'w2', touchedAt: '2026-11-09' })];
  assert.equal(statusLine({ ...base, works }, P), '進めていること 2件 | 証憑消込の改善: 課題からアプリを作る');
});
test('画面の下の1行: 同じ日なら配列で後ろの取り組み、休み中は数えない', () => {
  const works = [w({ name: 'A' }), w({ slug: 'w2', name: 'B' }), w({ slug: 'w3', name: 'C', state: 'paused', touchedAt: '2026-11-10' })];
  assert.equal(statusLine({ ...base, works }, P), '進めていること 2件 | B: 課題からアプリを作る');
});
test('画面の下の1行: 進めている取り組みがない', () => {
  assert.equal(statusLine({ ...base, works: [w({ state: 'paused' })] }, P), '進めていること 0件');
});
test('画面の下の1行: 環境づくりが未完', () => {
  assert.equal(statusLine({ ...base, setupDone: false, works: [], stages: [{ id: 0, done: false, missing: ['CLAUDE.md を書く'] }], currentStage: 0 }, P), 'はじめに | 次: CLAUDE.md を書く');
});
