import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const script = join(root, 'scripts', 'update-course.mjs');
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8', stdio: 'pipe' });

function write(dir, path, body) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), body);
}

function setup() {
  const base = mkdtempSync(join(tmpdir(), '更新 テスト-'));
  const upstream = join(base, 'upstream');
  mkdirSync(upstream);
  git(upstream, 'init', '-q', '-b', 'main');
  write(upstream, 'course/stage-0.md', '新しい教材');
  write(upstream, 'scripts/x.mjs', '// new');
  write(upstream, '.claude/skills/next/SKILL.md', 'new skill');
  write(upstream, 'CLAUDE.md', 'テンプレートの CLAUDE');
  write(upstream, 'docs/01-tasks.md', 'テンプレートの棚卸し');
  git(upstream, 'add', '-A');
  git(upstream, 'commit', '-q', '-m', 'init');

  const learner = join(base, 'learner');
  mkdirSync(learner);
  git(learner, 'init', '-q', '-b', 'main');
  write(learner, 'course/stage-0.md', '古い教材');
  write(learner, 'CLAUDE.md', '受講者の CLAUDE');
  write(learner, 'docs/01-tasks.md', '受講者の棚卸し');
  git(learner, 'add', '-A');
  git(learner, 'commit', '-q', '-m', 'mine');
  return { upstream, learner };
}

const run = (cwd, url) => spawnSync(process.execPath, [script], { cwd, encoding: 'utf8', env: { ...process.env, AI_COURSE_REMOTE: url } });

test('教材は更新され、受講者のファイルは変わらない', () => {
  const { upstream, learner } = setup();
  const r = run(learner, upstream);
  assert.equal(r.status, 0);
  assert.equal(readFileSync(join(learner, 'course/stage-0.md'), 'utf8'), '新しい教材');
  assert.equal(readFileSync(join(learner, '.claude/skills/next/SKILL.md'), 'utf8'), 'new skill');
  assert.equal(readFileSync(join(learner, 'CLAUDE.md'), 'utf8'), '受講者の CLAUDE');
  assert.equal(readFileSync(join(learner, 'docs/01-tasks.md'), 'utf8'), '受講者の棚卸し');
});

test('2回続けて実行しても成功する', () => {
  const { upstream, learner } = setup();
  assert.equal(run(learner, upstream).status, 0);
  assert.equal(run(learner, upstream).status, 0);
});

test('リモートに届かなくても終了コード 0 で手元の版を案内する', () => {
  const { learner } = setup();
  const r = run(learner, join(tmpdir(), 'no-such-repo-xyz'));
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('手元の版で続けます'));
  assert.equal(readFileSync(join(learner, 'course/stage-0.md'), 'utf8'), '古い教材');
});
