import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEvents, addEvent, runningAskDue, reviewDue } from '../scripts/events.mjs';
import { renderTimeline, parseMilestones } from '../scripts/history.mjs';
import { loadRoadmap } from '../scripts/roadmap.mjs';
import { loadPhases } from '../scripts/phases.mjs';

const CLI = join(dirname(dirname(fileURLToPath(import.meta.url))), 'scripts', 'events.mjs');

test('addEvent: running は月に1回、delegated は日に1回', () => {
  const a = addEvent([], 'running', '2026-11-09');
  assert.equal(addEvent(a, 'running', '2026-11-20').length, 1);
  assert.equal(addEvent(a, 'running', '2026-12-01').length, 2);
  const d = addEvent([], 'delegated', '2026-11-09');
  assert.equal(addEvent(d, 'delegated', '2026-11-09').length, 1);
  assert.equal(addEvent(d, 'delegated', '2026-11-10').length, 2);
});
test('addEvent: 知らない種類は例外', () => assert.throws(() => addEvent([], 'x', '2026-11-09')));
test('runningAskDue: 今月まだ記録がなければ true', () => {
  assert.equal(runningAskDue([], '2026-11'), true);
  assert.equal(runningAskDue([{ kind: 'running', date: '2026-11-02' }], '2026-11'), false);
  assert.equal(runningAskDue([{ kind: 'delegated', date: '2026-11-02' }], '2026-11'), true);
});
test('parseEvents: 壊れた内容・知らない種類・実在しない日付は捨てる', () => {
  assert.deepEqual(parseEvents(null), []);
  assert.deepEqual(parseEvents('{'), []);
  assert.deepEqual(parseEvents('{"kind":"running","date":"2026-11-09"}'), []);
  assert.deepEqual(parseEvents('[{"kind":"x","date":"2026-11-09"},{"kind":"running","date":"2026-02-30"},{"kind":"running","date":"2026-11-09"},null]'), [{ kind: 'running', date: '2026-11-09' }]);
});
test('renderTimeline: 申告の出来事を文にする', () => {
  const text = renderTimeline([{ key: 'event:delegated', date: '2026-11-06' }, { key: 'event:running', date: '2026-11-08' }], loadRoadmap(), { phases: loadPhases(), mechanisms: [] });
  assert.deepEqual(text.split('\n'), ['2026-11-06 仕事をAIに任せた', '2026-11-08 作ったものが今月も動いている']);
});
test('renderTimeline: 知らない種類のキーは仕組みのお題として表示しない', () => {
  const text = renderTimeline([{ key: 'event:zzz', date: '2026-11-06' }, { key: 'foo:1', date: '2026-11-07' }], loadRoadmap(), { phases: loadPhases(), mechanisms: [] });
  assert.equal(text, '');
});
test('parseMilestones: event:* を受け付けない', () => {
  assert.deepEqual(parseMilestones('{"events":[{"key":"event:running","date":"2026-11-08"}]}'), []);
});

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
const tempRepo = () => {
  const dir = mkdtempSync(join(tmpdir(), 'events-'));
  git(dir, 'init', '-q');
  return dir;
};
const trackLocal = (dir) => {
  mkdirSync(join(dir, '.local'));
  writeFileSync(join(dir, '.local', 'x'), 'x');
  git(dir, 'add', '.local/x');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'x');
};
test('CLI: .local が git で追跡されていると記録しない', () => {
  for (const kind of ['delegated', 'running']) {
    const dir = tempRepo();
    trackLocal(dir);
    const r = spawnSync('node', [CLI, 'add', kind], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.equal(existsSync(join(dir, '.local', 'events.json')), false);
  }
});
test('CLI: add は .local/events.json に記録し、知らない種類は失敗する', () => {
  const dir = tempRepo();
  const ok = spawnSync('node', [CLI, 'add', 'running'], { cwd: dir, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /このパソコン/);
  assert.equal(JSON.parse(readFileSync(join(dir, '.local', 'events.json'), 'utf8')).length, 1);
  const bad = spawnSync('node', [CLI, 'add', 'zzz'], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(bad.status, 0);
});
test('CLI: due は今月の記録がなければ はい、あれば いいえ', () => {
  const dir = tempRepo();
  const before = spawnSync('node', [CLI, 'due'], { cwd: dir, encoding: 'utf8' });
  assert.equal(before.status, 0);
  assert.equal(before.stdout.trim(), 'はい');
  spawnSync('node', [CLI, 'add', 'running'], { cwd: dir, encoding: 'utf8' });
  assert.equal(spawnSync('node', [CLI, 'due'], { cwd: dir, encoding: 'utf8' }).stdout.trim(), 'いいえ');
});

import { declaredEntries } from '../scripts/history.mjs';
test('asked: 月に1回。今月 running か asked があれば確認は不要で、add も増えない', () => {
  assert.ok(parseEvents('[{"kind":"asked","date":"2026-11-09"}]').length === 1);
  const a = addEvent([], 'asked', '2026-11-09');
  assert.equal(addEvent(a, 'asked', '2026-11-20').length, 1);
  assert.equal(addEvent(a, 'running', '2026-11-20').length, 1);
  assert.equal(addEvent(addEvent([], 'running', '2026-11-09'), 'asked', '2026-11-10').length, 1);
  assert.equal(addEvent(a, 'asked', '2026-12-01').length, 2);
  assert.equal(runningAskDue(a, '2026-11'), false);
  assert.equal(runningAskDue(a, '2026-12'), true);
});
test('asked: CLI で記録でき、due が いいえ になる。歩みの表示には出さない', () => {
  const dir = tempRepo();
  const ok = spawnSync('node', [CLI, 'add', 'asked'], { cwd: dir, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(spawnSync('node', [CLI, 'due'], { cwd: dir, encoding: 'utf8' }).stdout.trim(), 'いいえ');
  assert.deepEqual(declaredEntries([{ kind: 'asked', date: '2026-11-09' }, { kind: 'running', date: '2026-11-10' }]), [{ key: 'event:running', date: '2026-11-10' }]);
});

test('review は月に1回で、running/asked と互いに打ち消さない', () => {
  const a = addEvent([], 'asked', '2026-11-03');
  const b = addEvent(a, 'review', '2026-11-03');
  assert.equal(b.length, 2);
  assert.equal(addEvent(b, 'review', '2026-11-20').length, 2);
  assert.equal(runningAskDue(b, '2026-11'), false);
  assert.equal(reviewDue(a, '2026-11'), true);
  assert.equal(reviewDue(b, '2026-11'), false);
  assert.equal(reviewDue(b, '2026-12'), true);
  assert.equal(runningAskDue(addEvent([], 'review', '2026-11-03'), '2026-11'), true);
});

test('declaredEntries: 見直しを聞いた記録は歩みに出さない', () => {
  assert.deepEqual(declaredEntries([{ kind: 'review', date: '2026-11-09' }, { kind: 'running', date: '2026-11-10' }]), [{ key: 'event:running', date: '2026-11-10' }]);
});

test('CLI: due review は見直しの記録だけを見る', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ev-review-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const run = (...a) => execFileSync('node', [CLI, ...a], { cwd: dir, encoding: 'utf8' }).trim();
  run('add', 'asked');
  assert.equal(run('due', 'review'), 'はい');
  assert.equal(run('due'), 'いいえ');
  run('add', 'review');
  assert.equal(run('due', 'review'), 'いいえ');
});
