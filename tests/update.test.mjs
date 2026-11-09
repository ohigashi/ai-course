import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
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

const readSettings = (dir) => JSON.parse(readFileSync(join(dir, '.claude/settings.json'), 'utf8'));
const reminder = 'node scripts/session-reminder.mjs';

test('設定は決まった項目だけを追加し、受講者の設定を残す', () => {
  const { upstream, learner } = setup();
  write(learner, '.claude/settings.json', JSON.stringify({ permissions: { allow: ['Bash(ls)'] }, hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'node mine.mjs' }] }] } }));
  const check = run(learner, upstream);
  assert.match(check.stdout, /\.claude\/settings\.json/);
  run(learner, upstream, `--apply=${shaOf(check.stdout)}`);
  const s = readSettings(learner);
  assert.deepEqual(s.permissions, { allow: ['Bash(ls)'] });
  const commands = s.hooks.SessionStart.flatMap((e) => e.hooks.map((h) => h.command));
  assert.ok(commands.includes('node mine.mjs'));
  assert.ok(commands.includes(reminder));
  assert.equal(s.statusLine.command, 'node scripts/statusline.mjs');
});

test('設定の追加は2回行っても重複しない', () => {
  const { upstream, learner } = setup();
  const sha = shaOf(run(learner, upstream).stdout);
  run(learner, upstream, `--apply=${sha}`);
  run(learner, upstream, `--apply=${sha}`);
  assert.equal(readSettings(learner).hooks.SessionStart.flatMap((e) => e.hooks).filter((h) => h.command === reminder).length, 1);
});

test('壊れた設定ファイルは書き換えない', () => {
  const { upstream, learner } = setup();
  write(learner, '.claude/settings.json', '{ broken');
  run(learner, upstream, `--apply=${shaOf(run(learner, upstream).stdout)}`);
  assert.equal(readFileSync(join(learner, '.claude/settings.json'), 'utf8'), '{ broken');
});

test('受講者が自分で作ったスキルがあっても、更新の案内を繰り返さない', () => {
  const { upstream, learner } = setup();
  run(learner, upstream, `--apply=${shaOf(run(learner, upstream).stdout)}`);
  write(learner, '.claude/skills/my-skill/SKILL.md', '自分のスキル');
  git(learner, 'add', '-A');
  git(learner, 'commit', '-q', '-m', 'my skill');
  const r = run(learner, upstream);
  assert.ok(r.stdout.includes('最新です'));
  assert.ok(!r.stdout.includes('my-skill'));
});

test('log.mjs: 日付だけを activity.json に残し、.local は GitHub に上がらない', () => {
  const { learner } = setup();
  write(learner, '.local/log.md', '- 顧客の話');
  const log = join(root, 'scripts', 'log.mjs');
  assert.equal(spawnSync(process.execPath, [log], { cwd: learner, encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync(process.execPath, [log], { cwd: learner, encoding: 'utf8' }).status, 0);
  const days = JSON.parse(readFileSync(join(learner, 'activity.json'), 'utf8')).days;
  assert.equal(days.length, 1);
  assert.match(days[0], /^\d{4}-\d{2}-\d{2}$/);
  const status = git(learner, 'status', '--porcelain');
  assert.ok(status.includes('activity.json'));
  assert.ok(!status.includes('.local'));
  assert.equal(readFileSync(join(learner, '.git/info/exclude'), 'utf8').split('\n').filter((l) => l === '.local/').length, 1);
});

test('log.mjs: info フォルダが無くても除外でき、.local が既に commit されていたら止める', () => {
  const { learner } = setup();
  rmSync(join(learner, '.git/info'), { recursive: true, force: true });
  const log = join(root, 'scripts', 'log.mjs');
  assert.equal(spawnSync(process.execPath, [log], { cwd: learner, encoding: 'utf8' }).status, 0);
  assert.ok(readFileSync(join(learner, '.git/info/exclude'), 'utf8').includes('.local/'));
  write(learner, '.local/log.md', 'x');
  git(learner, 'add', '-f', '.local/log.md');
  git(learner, 'commit', '-q', '-m', 'oops');
  const r = spawnSync(process.execPath, [log], { cwd: learner, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes('大東に相談'));
});

test('--apply でも .local を除外する', () => {
  const { upstream, learner } = setup();
  run(learner, upstream, `--apply=${shaOf(run(learner, upstream).stdout)}`);
  assert.ok(readFileSync(join(learner, '.git/info/exclude'), 'utf8').includes('.local/'));
});

const challenge = join(root, 'scripts', 'challenge.mjs');

test('challenge.mjs status: .local を除外する', () => {
  const { learner } = setup();
  assert.equal(spawnSync(process.execPath, [challenge, 'status'], { cwd: learner, encoding: 'utf8' }).status, 0);
  assert.ok(readFileSync(join(learner, '.git/info/exclude'), 'utf8').includes('.local/'));
});

test('challenge.mjs check: 評価の前にいまのレベルかを確かめて理由を返す', () => {
  const { learner } = setup();
  const ok = spawnSync(process.execPath, [challenge, 'check', 'l1-message'], { cwd: learner, encoding: 'utf8' });
  assert.equal(ok.status, 0);
  const ng = spawnSync(process.execPath, [challenge, 'check', 'l5-giveaway'], { cwd: learner, encoding: 'utf8' });
  assert.equal(ng.status, 1);
  assert.ok(ng.stdout.includes('いまのレベル'));
});
