import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMechanisms, parseMechanismLog, markMechanismDone } from '../scripts/mechanism.mjs';

const CLI = join(dirname(dirname(fileURLToPath(import.meta.url))), 'scripts', 'mechanism.mjs');

test('お題は各フェーズ2〜3題で、id が重複しない', () => {
  const c = loadMechanisms();
  assert.equal(new Set(c.map((m) => m.id)).size, c.length);
  for (const phase of [1, 2, 3, 4]) { const n = c.filter((m) => m.phase === phase).length; assert.ok(n >= 2 && n <= 3, String(phase)); }
});
test('markMechanismDone: 記録する。同じお題は最初の日付を残す。知らない id は例外', () => {
  const c = [{ id: 'a', phase: 1, title: 't', prompt: 'p' }];
  const one = markMechanismDone([], 'a', '2026-11-09', c);
  assert.deepEqual(one, [{ id: 'a', date: '2026-11-09' }]);
  assert.deepEqual(markMechanismDone(one, 'a', '2026-11-10', c), one);
  assert.throws(() => markMechanismDone([], 'zzz', '2026-11-09', c));
});
test('parseMechanismLog: 壊れた内容は空、不正な行は捨てる', () => {
  assert.deepEqual(parseMechanismLog(null), []);
  assert.deepEqual(parseMechanismLog('{'), []);
  assert.deepEqual(parseMechanismLog('[{"id":"a","date":"x"},{"id":"a","date":"2026-11-09"}]'), [{ id: 'a', date: '2026-11-09' }]);
});
test('parseMechanismLog: 同じ id が2つあれば最初の日付を残す',() => {
  assert.deepEqual(parseMechanismLog('[{"id":"a","date":"2026-11-09"},{"id":"a","date":"2026-11-10"}]'), [{ id: 'a', date: '2026-11-09' }]);
});
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
const tempRepo = () => {
  const dir = mkdtempSync(join(tmpdir(), 'mech-'));
  git(dir, 'init', '-q');
  return dir;
};
test('CLI: .local が git で追跡されていると記録しない', () => {
  const dir = tempRepo();
  mkdirSync(join(dir, '.local'));
  writeFileSync(join(dir, '.local', 'x'), 'x');
  git(dir, 'add', '.local/x');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'x');
  const r = spawnSync('node', [CLI, 'done', 'prompt-compare'], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.equal(existsSync(join(dir, '.local', 'mechanisms.json')), false);
});
test('CLI: 追跡されていなければ .local/mechanisms.json に記録し、知らない id は失敗する', () => {
  const dir = tempRepo();
  const ok = spawnSync('node', [CLI, 'done', 'prompt-compare'], { cwd: dir, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(existsSync(join(dir, '.local', 'mechanisms.json')));
  const bad = spawnSync('node', [CLI, 'done', 'zzz'], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(bad.status, 0);
});
