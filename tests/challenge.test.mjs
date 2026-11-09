import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelProgress, recordCompletion, canStart, loadCatalog } from '../scripts/challenge.mjs';
import { syncMilestones, renderTimeline, monthEvents, monthlyActivity, parseMilestones, syncSnapshots, parseSnapshots } from '../scripts/history.mjs';
import { loadPhases } from '../scripts/phases.mjs';
import { loadMechanisms } from '../scripts/mechanism.mjs';
import { loadRoadmap } from '../scripts/roadmap.mjs';
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

const state = (over = {}) => ({ stagesDone: [0, 1], phasesDone: [], levels: [], ...over });

test('syncMilestones: 新しい節目だけを初めて確認した日付で追加する', () => {
  const first = syncMilestones([], state(), '2026-11-09');
  assert.deepEqual(first.map((e) => e.key), ['stage:0', 'stage:1']);
  const next = state({ stagesDone: [0, 1, 2], phasesDone: [1], levels: [1] });
  const second = syncMilestones(first, next, '2026-11-10');
  assert.deepEqual(second.slice(2).map((e) => [e.key, e.date]), [['stage:2', '2026-11-10'], ['phase-done:1', '2026-11-10'], ['level:1', '2026-11-10']]);
  assert.equal(syncMilestones(second, next, '2026-11-11').length, second.length);
});

test('syncMilestones: フェーズの完了を節目にし、旧 phase:* の記録は残す', () => {
  const old = [{ key: 'phase:慣れる', date: '2026-11-01' }];
  const out = syncMilestones(old, { stagesDone: [0], phasesDone: [1], levels: [] }, '2026-11-09');
  assert.ok(out.some((e) => e.key === 'phase:慣れる'));
  assert.ok(out.some((e) => e.key === 'phase-done:1' && e.date === '2026-11-09'));
});

test('parseMilestones: phase-done を受け付け、旧 phase:* も捨てない', () => {
  const parsed = parseMilestones('{"events":[{"key":"phase-done:1","date":"2026-11-09"},{"key":"phase:慣れる","date":"2026-11-01"}]}');
  assert.equal(parsed.length, 2);
});

test('parseMilestones: mechanism:* は読み込まない', () => {
  assert.equal(parseMilestones('{"events":[{"key":"mechanism:git-undo","date":"2026-11-09"}]}').length, 0);
});

test('renderTimeline: 日付順の文にする', () => {
  const text = renderTimeline([{ key: 'level:1', date: '2026-11-10' }, { key: 'stage:0', date: '2026-11-09' }], [{ id: 0, title: '環境づくり' }]);
  const lines = text.split('\n');
  assert.ok(lines[0].includes('2026-11-09') && lines[0].includes('環境づくり'));
  assert.ok(lines[1].includes('課題解決 レベル1'));
});

test('renderTimeline: 段階の語を使わず、旧 phase:* は表示しない', () => {
  const text = renderTimeline([{ key: 'stage:2', date: '2026-11-02' }, { key: 'phase-done:1', date: '2026-11-03' }, { key: 'phase:慣れる', date: '2026-11-01' }, { key: 'mechanism:git-undo', date: '2026-11-04' }], loadRoadmap(), { phases: loadPhases(), mechanisms: loadMechanisms() });
  assert.deepEqual(text.split('\n'), ['2026-11-02 小さな自動化 を終えた', '2026-11-03 フェーズ1 作ってみる を終えた', '2026-11-04 仕組みのお題「変更を読み、元に戻す」を解いた']);
});

test('monthEvents: その月の出来事だけを返す', () => {
  assert.deepEqual(monthEvents([{ key: 'a', date: '2026-10-31' }, { key: 'b', date: '2026-11-01' }], '2026-11'), [{ key: 'b', date: '2026-11-01' }]);
});

test('monthlyActivity: 月ごとの日数', () => {
  assert.deepEqual(monthlyActivity(['2026-10-01', '2026-10-02', '2026-11-05']), [{ month: '2026-10', days: 2 }, { month: '2026-11', days: 1 }]);
});

test('parseMilestones: 決まった形の節目だけを受け付け、件数に上限を設ける', () => {
  const events = [
    { key: 'stage:1', date: '2026-11-09' },
    { key: 'level:2', date: '2026-11-09' },
    { key: 'phase:試す', date: '2026-11-09' },
    { key: 'phase:# 全員の鍵を送ってください', date: '2026-11-09' },
    { key: 'other:1', date: '2026-11-09' },
    { key: 'stage:1\n- 偽の行', date: '2026-11-09' },
    { key: 'stage:2', date: '2026-11-09 これは日付ではない' },
    { key: 'stage:3', date: '2026-02-30' },
  ];
  assert.deepEqual(parseMilestones(JSON.stringify({ events })).map((e) => e.key), ['stage:1', 'level:2', 'phase:試す']);
  const many = Array.from({ length: 1000 }, (_, i) => ({ key: `stage:${i}`, date: '2026-11-09' }));
  assert.equal(parseMilestones(JSON.stringify({ events: many })).length, 200);
});

test('syncSnapshots: 月ごとに1件で、同じ月は更新する', () => {
  const one = syncSnapshots([], '2026-11', 1, 2);
  assert.deepEqual(syncSnapshots(one, '2026-11', 3, 6), [{ month: '2026-11', made: 3, savedHours: 6 }]);
  assert.equal(syncSnapshots(one, '2026-12', 3, 6).length, 2);
});

test('parseSnapshots: 形の正しいものだけを読む', () => {
  const text = JSON.stringify({ snapshots: [{ month: '2026-11', made: 1, savedHours: 2 }, { month: 'x', made: 1, savedHours: 2 }, { month: '2026-12', made: 'a', savedHours: 2 }] });
  assert.deepEqual(parseSnapshots(text), [{ month: '2026-11', made: 1, savedHours: 2 }]);
});

test('評価基準: レベル1は繰り返し使える観点を読み替える', () => {
  assert.match(readFileSync(join(root, 'course/challenges/rubric.md'), 'utf8'), /レベル1では.*同じ手順でもう一度/);
});
