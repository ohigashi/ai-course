import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addWork, moveWork, setWorkNext, setWorkState, closeRound } from '../scripts/work.mjs';
import { roundCount } from '../scripts/works.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'work.mjs');

test('addWork: 連番の slug を付け、main と重ならない', () => {
  const out = addWork(addWork([], 'A', 1, 'd'), 'B', 3, 'd');
  assert.deepEqual(out.map((w) => [w.slug, w.phase, w.state]), [['w1', 1, 'active'], ['w2', 3, 'active']]);
});
test('addWork: 上限の20件を超えると例外', () => {
  let w = [];
  for (let i = 0; i < 20; i += 1) w = addWork(w, `n${i}`, 1, 'd');
  assert.throws(() => addWork(w, 'x', 1, 'd'));
});
test('addWork: 番号は最大の次で、消した番号を使い回さず main は作らない', () => {
  const w = addWork(addWork(addWork([], 'A', 1, 'd'), 'B', 1, 'd'), 'C', 1, 'd');
  const out = addWork(w.filter((x) => x.slug !== 'w3'), 'D', 1, 'd');
  assert.equal(out.at(-1).slug, 'w3');
  const gap = addWork(w.filter((x) => x.slug !== 'w2'), 'E', 1, 'd');
  assert.equal(gap.at(-1).slug, 'w4');
  assert.notEqual(addWork([{ ...w[0], slug: 'main' }], 'F', 1, 'd').at(-1).slug, 'main');
});
test('addWork: 名前が空、フェーズが範囲外は例外。今日の日付を入れる', () => {
  assert.throws(() => addWork([], '  ', 1, 'd'));
  assert.throws(() => addWork([], 'A', 5, 'd'));
  const [w] = addWork([], 'A', 2, '2026-11-09');
  assert.equal(w.startedAt, '2026-11-09');
  assert.equal(w.touchedAt, '2026-11-09');
});
test('moveWork: どのフェーズへも動かせる。範囲外と知らない slug は例外', () => {
  const w = addWork([], 'A', 1, 'd');
  assert.equal(moveWork(w, 'w1', 4, 'e')[0].phase, 4);
  assert.equal(moveWork(w, 'w1', 4, 'e')[0].touchedAt, 'e');
  assert.throws(() => moveWork(w, 'w1', 5, 'e'));
  assert.throws(() => moveWork(w, 'zz', 2, 'e'));
});
test('setWorkNext と setWorkState: 更新して touchedAt を変える。不正な状態は例外', () => {
  const w = addWork([], 'A', 1, 'd');
  const n = setWorkNext(w, 'w1', '  見積りを\n作る ', 'e')[0];
  assert.equal(n.next, '見積りを 作る');
  assert.equal(n.touchedAt, 'e');
  assert.equal(setWorkState(w, 'w1', 'paused', 'e')[0].state, 'paused');
  assert.throws(() => setWorkState(w, 'w1', 'x', 'e'));
  assert.throws(() => setWorkNext(w, 'zz', 'a', 'e'));
});
test('closeRound: フェーズ3と4はいつでも1回足す', () => {
  const w = moveWork(addWork([], 'A', 1, 'd'), 'w1', 3, 'd');
  const out = closeRound(closeRound(w, 'w1', 'e'), 'w1', 'f');
  assert.equal(roundCount(out[0], 3), 2);
  assert.equal(out[0].touchedAt, 'f');
});
test('closeRound: フェーズ1と2は判定が通った1回目のあとだけ足せる', () => {
  const w = addWork([], 'A', 1, 'd');
  assert.throws(() => closeRound(w, 'w1', 'e'));
  const passed = [{ ...w[0], rounds: [{ phase: 1, date: 'd' }] }];
  assert.equal(roundCount(closeRound(passed, 'w1', 'e')[0], 1), 2);
  const p2 = [{ ...w[0], phase: 2, rounds: [{ phase: 1, date: 'd' }] }];
  assert.throws(() => closeRound(p2, 'w1', 'e'));
});
test('純粋関数は元の配列を書き換えない', () => {
  const w = addWork([], 'A', 1, 'd');
  const snap = JSON.stringify(w);
  moveWork(w, 'w1', 2, 'e'); setWorkNext(w, 'w1', 'x', 'e'); setWorkState(w, 'w1', 'paused', 'e');
  assert.equal(JSON.stringify(w), snap);
});

function tmpRepo({ setup = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'work-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  if (setup) {
    const body = ['仕事と役割', 'AIに任せたいこと', '文章や報告の好み', '確認してほしいタイミング', '大切にしている判断の基準'].map((h) => `## ${h}\n\n受講者Aの記述です。\n`).join('\n');
    writeFileSync(join(dir, 'CLAUDE.md'), `# 受講者A\n\n${body}`);
  }
  return dir;
}
const cli = (cwd, ...args) => spawnSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8' });
const readWorks = (dir) => JSON.parse(readFileSync(join(dir, 'works.json'), 'utf8')).items;

test('CLI: 壊れた works.json を上書きしない', () => {
  const dir = tmpRepo();
  writeFileSync(join(dir, 'works.json'), '{');
  for (const args of [['new', 'A'], ['sync'], ['pause', 'w1']]) {
    const r = cli(dir, ...args);
    assert.notEqual(r.status, 0, args.join(' '));
  }
  assert.equal(readFileSync(join(dir, 'works.json'), 'utf8'), '{');
});
test('CLI: 環境づくりが未完なら new は止まる', () => {
  const dir = tmpRepo({ setup: false });
  const r = cli(dir, 'new', 'A');
  assert.notEqual(r.status, 0);
  assert.equal(existsSync(join(dir, 'works.json')), false);
  assert.equal(existsSync(join(dir, 'works')), false);
});
test('CLI: new は main を先に作り、取り組みの置き場とひな形を用意する', () => {
  const dir = tmpRepo();
  const r = cli(dir, 'new', '提案書づくり');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /取り組み「提案書づくり」を始めました\(w1\)/);
  const items = readWorks(dir);
  assert.deepEqual(items.map((w) => [w.slug, w.phase]), [['main', 1], ['w1', 1]]);
  for (const f of ['01-tasks.md', '01-problem.md', '02-log.md', '03-spec.md', '04-check.md', '05-launch.md']) {
    assert.ok(existsSync(join(dir, 'works/w1/docs', f)), f);
  }
  assert.ok(existsSync(join(dir, 'works/w1/work/.gitkeep')));
  assert.ok(existsSync(join(dir, 'works/w1/app/.gitkeep')));
  assert.equal(existsSync(join(dir, 'works/w1/docs/06-team.md')), false);
});
test('CLI: new --phase で始めるフェーズを選べ、範囲外は止まる', () => {
  const dir = tmpRepo();
  assert.equal(cli(dir, 'new', 'A', '--phase', '3').status, 0);
  assert.equal(readWorks(dir).find((w) => w.slug === 'w1').phase, 3);
  const bad = cli(dir, 'new', 'B', '--phase', '9');
  assert.notEqual(bad.status, 0);
  assert.equal(readWorks(dir).length, 2);
});
test('CLI: move, next, pause, resume, round と、失敗時は書き換えない', () => {
  const dir = tmpRepo();
  cli(dir, 'new', 'A');
  assert.equal(cli(dir, 'move', 'w1', '2').status, 0);
  assert.equal(cli(dir, 'next', 'w1', '見積りを作る').status, 0);
  assert.equal(cli(dir, 'pause', 'w1').status, 0);
  let w = readWorks(dir).find((x) => x.slug === 'w1');
  assert.deepEqual([w.phase, w.next, w.state], [2, '見積りを作る', 'paused']);
  assert.equal(cli(dir, 'resume', 'w1').status, 0);
  assert.equal(readWorks(dir).find((x) => x.slug === 'w1').state, 'active');
  const before = readFileSync(join(dir, 'works.json'), 'utf8');
  assert.notEqual(cli(dir, 'round', 'w1').status, 0);
  assert.notEqual(cli(dir, 'move', 'w1', '7').status, 0);
  assert.notEqual(cli(dir, 'move', 'zz', '2').status, 0);
  assert.equal(readFileSync(join(dir, 'works.json'), 'utf8'), before);
  cli(dir, 'move', 'w1', '3');
  assert.equal(cli(dir, 'round', 'w1').status, 0);
  w = readWorks(dir).find((x) => x.slug === 'w1');
  assert.equal(roundCount(w, 3), 1);
});
test('CLI: sync は works.json を作り、list は取り組みを表示する', () => {
  const dir = tmpRepo();
  assert.equal(cli(dir, 'sync').status, 0);
  assert.deepEqual(readWorks(dir).map((w) => w.slug), ['main']);
  const r = cli(dir, 'list');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /main/);
  assert.ok(!r.stdout.includes('段階'));
});

test('CLI: 判定が通って回数が未保存でも、round は1回目を記録するだけで2回目は足さない', () => {
  const dir = tmpRepo();
  cli(dir, 'new', 'A');
  writeFileSync(join(dir, 'works/w1/work/tool.txt'), 'x');
  writeFileSync(join(dir, 'works/w1/docs/02-log.md'), [
    '# 小さな自動化の記録', '', '1回あたりの時間(前): 30分', '1回あたりの時間(後): 5分', '月の回数: 4回', '',
    '## やったこと', '', '請求書の作成をスクリプトにしました。', '', '## 結果', '', '作業が5分に短くなりました。', '',
  ].join('\n'));
  assert.equal(roundCount(readWorks(dir).find((w) => w.slug === 'w1'), 1), 0);
  const first = cli(dir, 'round', 'w1');
  assert.equal(first.status, 0, first.stdout);
  assert.equal(roundCount(readWorks(dir).find((w) => w.slug === 'w1'), 1), 1);
  const second = cli(dir, 'round', 'w1');
  assert.equal(second.status, 0, second.stdout);
  assert.equal(roundCount(readWorks(dir).find((w) => w.slug === 'w1'), 1), 2);
});
test('CLI: next に文章がなければ止まり、書き換えない', () => {
  const dir = tmpRepo();
  cli(dir, 'new', 'A');
  cli(dir, 'next', 'w1', '見積りを作る');
  const before = readFileSync(join(dir, 'works.json'), 'utf8');
  const r = cli(dir, 'next', 'w1');
  assert.notEqual(r.status, 0);
  assert.equal(readFileSync(join(dir, 'works.json'), 'utf8'), before);
});
