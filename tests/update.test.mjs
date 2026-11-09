import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
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
  write(upstream, '.claude/settings.json', '{"new":true}');
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

const run = (cwd, url, ...args) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', env: { ...process.env, AI_COURSE_REMOTE: url } });

const shaOf = (stdout) => stdout.match(/版: ([0-9a-f]{40})/)?.[1];

test('確認だけでは何も書き換えず、版と変更されるファイルを示す', () => {
  const { upstream, learner } = setup();
  const r = run(learner, upstream);
  assert.equal(r.status, 0);
  assert.equal(readFileSync(join(learner, 'course/stage-0.md'), 'utf8'), '古い教材');
  assert.equal(existsSync(join(learner, 'scripts/x.mjs')), false);
  assert.ok(r.stdout.includes('更新があります'));
  assert.ok(shaOf(r.stdout));
  assert.match(r.stdout, /course\/stage-0\.md/);
  assert.match(r.stdout, /scripts\/x\.mjs/);
});

test('了承した版だけを適用し、受講者のファイルは変わらない', () => {
  const { upstream, learner } = setup();
  const sha = shaOf(run(learner, upstream).stdout);
  write(upstream, 'course/stage-0.md', 'さらに新しい教材');
  git(upstream, 'add', '-A');
  git(upstream, 'commit', '-q', '-m', 'next');
  const r = run(learner, upstream, `--apply=${sha}`);
  assert.equal(r.status, 0);
  assert.equal(readFileSync(join(learner, 'course/stage-0.md'), 'utf8'), '新しい教材');
  assert.equal(readFileSync(join(learner, 'scripts/x.mjs'), 'utf8'), '// new');
  assert.equal(readFileSync(join(learner, '.claude/skills/next/SKILL.md'), 'utf8'), 'new skill');
  assert.equal(readFileSync(join(learner, '.claude/settings.json'), 'utf8'), '{"new":true}');
  assert.equal(readFileSync(join(learner, 'CLAUDE.md'), 'utf8'), '受講者の CLAUDE');
  assert.equal(readFileSync(join(learner, 'docs/01-tasks.md'), 'utf8'), '受講者の棚卸し');
});

test('適用のあとは最新と表示する', () => {
  const { upstream, learner } = setup();
  run(learner, upstream, `--apply=${shaOf(run(learner, upstream).stdout)}`);
  assert.ok(run(learner, upstream).stdout.includes('最新です'));
});

test('版の形式が正しくなければ適用しない', () => {
  const { upstream, learner } = setup();
  run(learner, upstream);
  const r = run(learner, upstream, '--apply=course/main');
  assert.equal(r.status, 0);
  assert.equal(readFileSync(join(learner, 'course/stage-0.md'), 'utf8'), '古い教材');
});

test('リモートに届かなくても終了コード 0 で手元の版を案内する', () => {
  const { learner } = setup();
  const r = run(learner, join(tmpdir(), 'no-such-repo-xyz'));
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('手元の版で続けます'));
});
