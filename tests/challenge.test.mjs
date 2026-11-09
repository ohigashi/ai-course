import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelProgress, recordCompletion, canStart, loadCatalog } from '../scripts/challenge.mjs';
import { syncMilestones, renderTimeline, teamMilestones, monthlyActivity } from '../scripts/history.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const catalog = [
  { id: 'a1', level: 1 }, { id: 'a2', level: 1 }, { id: 'a3', level: 1 },
  { id: 'b1', level: 2 }, { id: 'b2', level: 2 },
];

test('levelProgress: 同じレベルを2つ解くとレベル完了', () => {
  assert.deepEqual(levelProgress([], catalog), { current: 1, completedLevels: [] });
  assert.deepEqual(levelProgress([{ id: 'a1' }], catalog), { current: 1, completedLevels: [] });
  assert.deepEqual(levelProgress([{ id: 'a1' }, { id: 'a3' }], catalog), { current: 2, completedLevels: [1] });
  assert.deepEqual(levelProgress([{ id: 'a1' }, { id: 'a3' }, { id: 'b1' }, { id: 'b2' }], catalog), { current: null, completedLevels: [1, 2] });
});

test('levelProgress: 前のレベルを終えずに解いたものは数えない', () => {
  assert.deepEqual(levelProgress([{ id: 'b1' }, { id: 'b2' }, { id: 'a1' }], catalog), { current: 1, completedLevels: [] });
});

test('canStart: いまのレベル以下の課題だけ始められる', () => {
  assert.equal(canStart('a1', [], catalog), true);
  assert.equal(canStart('b1', [], catalog), false);
  assert.equal(canStart('b1', [{ id: 'a1' }, { id: 'a2' }], catalog), true);
  assert.equal(canStart('zz', [], catalog), false);
});

test('recordCompletion: 同じ課題を重複させず、存在しない課題は受けない', () => {
  const one = recordCompletion([], 'a1', '2026-11-09', catalog);
  assert.deepEqual(one, [{ id: 'a1', date: '2026-11-09' }]);
  assert.deepEqual(recordCompletion(one, 'a1', '2026-11-10', catalog), one);
  assert.throws(() => recordCompletion([], 'zz', '2026-11-09', catalog));
});

test('課題の一覧: 5レベルあり、各レベル2題以上で教材と評価基準がある', () => {
  const list = loadCatalog();
  for (const level of [1, 2, 3, 4, 5]) assert.ok(list.filter((c) => c.level === level).length >= 2, `level ${level}`);
  for (const c of list) assert.ok(existsSync(join(root, 'course/challenges', c.file)), c.file);
  const rubric = readFileSync(join(root, 'course/challenges/rubric.md'), 'utf8');
  assert.ok(rubric.includes('できたもの') && rubric.includes('プロセス'));
});

const state = (over = {}) => ({ stagesDone: [0, 1], phase: '学ぶ', levels: [], ...over });

test('syncMilestones: 新しい節目だけを初めて確認した日付で追加する', () => {
  const first = syncMilestones([], state(), '2026-11-09');
  assert.deepEqual(first.map((e) => e.key), ['stage:0', 'stage:1', 'phase:学ぶ']);
  const second = syncMilestones(first, state({ stagesDone: [0, 1, 2], phase: '試す', levels: [1] }), '2026-11-10');
  assert.deepEqual(second.slice(3).map((e) => [e.key, e.date]), [['stage:2', '2026-11-10'], ['phase:試す', '2026-11-10'], ['level:1', '2026-11-10']]);
  assert.equal(syncMilestones(second, state({ stagesDone: [0, 1, 2], phase: '試す', levels: [1] }), '2026-11-11').length, second.length);
});

test('syncMilestones: 位置が戻っても過去の節目は消えない', () => {
  const events = syncMilestones([], state({ phase: '試す' }), '2026-11-09');
  assert.ok(syncMilestones(events, state({ phase: '学ぶ' }), '2026-11-10').some((e) => e.key === 'phase:試す'));
});

test('renderTimeline: 日付順の文にする', () => {
  const text = renderTimeline([{ key: 'level:1', date: '2026-11-10' }, { key: 'stage:0', date: '2026-11-09' }], [{ id: 0, title: '環境づくり' }]);
  const lines = text.split('\n');
  assert.ok(lines[0].includes('2026-11-09') && lines[0].includes('環境づくり'));
  assert.ok(lines[1].includes('課題解決 レベル1'));
});

test('teamMilestones: 「継続される」はチームに出さない', () => {
  const list = teamMilestones([{ key: 'phase:継続される', date: 'd' }, { key: 'phase:試す', date: 'd' }, { key: 'level:1', date: 'd' }]);
  assert.deepEqual(list.map((e) => e.key), ['phase:試す', 'level:1']);
});

test('monthlyActivity: 月ごとの日数', () => {
  assert.deepEqual(monthlyActivity(['2026-10-01', '2026-10-02', '2026-11-05']), [{ month: '2026-10', days: 2 }, { month: '2026-11', days: 1 }]);
});
