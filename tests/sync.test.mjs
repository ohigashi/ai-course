import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { AUTO_SUBJECT, applyProgress, buildProgress, nextActionOf, parseProgress, syncRepo } from '../scripts/sync.mjs';
import { nextStepOf, recentMoves, renderPage, renderTeamMd } from '../scripts/status.mjs';

const stages = (currentStage) => [
  { id: 0, title: '環境', done: true, missing: [] },
  { id: 5, title: '公開と運用', done: currentStage !== 5, missing: currentStage === 5 ? ['公開先を書く', '改善を書く'] : [] },
];
const result = (currentStage) => ({ stages: stages(currentStage), currentStage, lastCommitDate: '2026-11-09T10:00:00+09:00', phase: '慣れる' });
const IDS = [0, 5];

test('次の一歩は、いまの段階の最初の残り', () => {
  assert.equal(nextActionOf(result(5)), '公開先を書く');
});

test('全段階を終えた人には、フェーズの案内を返す', () => {
  assert.match(nextActionOf(result(null)), /^フェーズ1と2を終えました/);
});

test('基本の段階を終えて課題解決が残っている人の次の一歩は /challenge', () => {
  const r = result(null);
  r.stages.push({ id: 7, title: '課題解決とプロダクト', done: false, missing: ['課題解決のレベルをすべて終える'], optional: true });
  assert.match(nextActionOf(r), /\/challenge/);
});

test('課題解決も終えた人には /challenge を案内しない', () => {
  const r = result(null);
  r.stages.push({ id: 7, title: '課題解決とプロダクト', done: true, missing: [], optional: true });
  assert.doesNotMatch(nextActionOf(r), /\/challenge/);
});

test('保存する内容は判定と次の一歩だけで、受講者の文章を含まない', () => {
  assert.deepEqual(Object.keys(buildProgress({ ...result(5), claudeMd: { secret: 1 }, activity: { monthDays: 3 } })).sort(), ['currentStage', 'nextAction', 'phase', 'stages']);
});

test('parseProgress: 作ったものをそのまま読み戻せる', () => {
  const parsed = parseProgress(JSON.stringify(buildProgress(result(5))), IDS);
  assert.equal(parsed.currentStage, 5);
  assert.deepEqual(parsed.stages[1].missing, ['公開先を書く', '改善を書く']);
});

test('parseProgress: 壊れた内容や存在しない段階は null', () => {
  assert.equal(parseProgress(null, IDS), null);
  assert.equal(parseProgress('{', IDS), null);
  assert.equal(parseProgress('[]', IDS), null);
  assert.equal(parseProgress(JSON.stringify({ ...buildProgress(result(5)), currentStage: 99 }), IDS), null);
  assert.equal(parseProgress(JSON.stringify({ ...buildProgress(result(5)), stages: 'x' }), IDS), null);
});

test('parseProgress: 知らない位置の名前は捨て、長い文は切り詰める', () => {
  const long = 'あ'.repeat(500);
  const data = buildProgress(result(5));
  const parsed = parseProgress(JSON.stringify({ ...data, phase: '<script>', stages: [{ id: 5, done: false, missing: [long] }] }), IDS);
  assert.equal(parsed.phase, null);
  assert.ok(parsed.stages[0].missing[0].length <= 200);
});

test('parseProgress: 新旧どちらの phase も受け付ける', () => {
  assert.equal(parseProgress(JSON.stringify({ currentStage: 1, phase: '作ってみる', stages: [] }), [1]).phase, '作ってみる');
  assert.equal(parseProgress(JSON.stringify({ currentStage: 1, phase: '慣れる', stages: [] }), [1]).phase, '慣れる');
});

test('applyProgress: 本人の判定で段階の状態を置き換える', () => {
  const merged = applyProgress(result(null), { currentStage: 5, phase: '試す', stages: [{ id: 5, done: false, missing: ['公開先を書く'] }] });
  assert.equal(merged.currentStage, 5);
  assert.equal(merged.phase, '試す');
  assert.deepEqual(merged.stages[1].missing, ['公開先を書く']);
  assert.equal(merged.stages[1].title, '公開と運用');
});

test('applyProgress: 本人の判定が無ければ運営側の判定のまま', () => {
  assert.deepEqual(applyProgress(result(null), null), result(null));
});

const member = (over = {}) => ({ name: '中村', github: 'n', repo: 'n/x', result: result(5), problem: null, ...over });

test('次の一歩: 更新待ちの人には更新の取り込みを先に案内する', () => {
  assert.equal(nextStepOf(member({ courseBehind: true })), 'コースの更新を /next で取り込む');
  assert.equal(nextStepOf(member()), '公開先を書く');
});

test('一覧: 次の一歩、更新待ち、未同期が大東のページに出る', () => {
  const html = renderPage([member({ courseBehind: true, synced: false })]);
  assert.ok(html.includes('次の一歩'));
  assert.ok(html.includes('コースの更新を /next で取り込む'));
  assert.ok(html.includes('更新待ち'));
  assert.ok(html.includes('未同期'));
});

test('最近の動き: 自動の保存は除き、本文はエスケープして載せる', () => {
  const log = `2026-11-09T16:00:00+09:00\t${AUTO_SUBJECT}\n2026-11-09T15:00:00+09:00\t歩みの更新\n2026-11-09T14:00:00+09:00\t<b>段階5</b>\n`;
  const moves = recentMoves(log);
  assert.deepEqual(moves.map((m) => m.subject), ['<b>段階5</b>']);
  const html = renderPage([member({ recent: moves })]);
  assert.ok(html.includes('&lt;b&gt;段階5'));
});

test('チームの一覧には次の一歩と最近の動きを載せない', () => {
  const md = renderTeamMd([member({ share: { share: true }, courseBehind: true, recent: [{ date: '2026-11-09T14:00', subject: '秘密の作業' }] })]);
  assert.ok(!md.includes('次の一歩'));
  assert.ok(!md.includes('公開先を書く'));
  assert.ok(!md.includes('秘密の作業'));
});

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8', stdio: 'pipe' });

function write(dir, path, body) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), body);
}

function setup() {
  const base = mkdtempSync(join(tmpdir(), '同期 テスト-'));
  const remote = join(base, 'remote.git');
  mkdirSync(remote);
  git(remote, 'init', '-q', '--bare', '-b', 'main');
  const dir = join(base, 'learner');
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 't');
  git(dir, 'config', 'user.email', 't@example.com');
  write(dir, 'course/a.md', '古い');
  write(dir, '.claude/skills/next/SKILL.md', '古い');
  write(dir, 'docs/x.md', '作業');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  git(dir, 'remote', 'add', 'origin', remote);
  git(dir, 'push', '-q', '-u', 'origin', 'main');
  return { dir, remote };
}
const remoteFiles = (remote) => git(remote, 'ls-tree', '-r', '-z', '--name-only', 'main').split('\0').filter(Boolean);
const remoteShow = (remote, path) => git(remote, 'show', `main:${path}`);

test('同期: progress.json を GitHub まで保存する', () => {
  const { dir, remote } = setup();
  assert.deepEqual(syncRepo(dir, result(5)), { committed: true, pushed: true });
  assert.ok(remoteFiles(remote).includes('progress.json'));
  assert.equal(git(remote, 'log', '-1', '--format=%s', 'main').trim(), AUTO_SUBJECT);
});

test('同期: 内容が変わらなければコミットしない', () => {
  const { dir } = setup();
  syncRepo(dir, result(5));
  const before = git(dir, 'rev-parse', 'HEAD');
  assert.deepEqual(syncRepo(dir, result(5)), { committed: false, pushed: false });
  assert.equal(git(dir, 'rev-parse', 'HEAD'), before);
});

test('同期: 取り込み済みのコースの更新も一緒に保存する', () => {
  const { dir, remote } = setup();
  write(dir, 'course/a.md', '新しい');
  write(dir, 'course/新しい教材.md', '追加');
  git(dir, 'add', 'course/新しい教材.md');
  syncRepo(dir, result(5));
  assert.equal(remoteShow(remote, 'course/a.md'), '新しい');
  assert.ok(remoteFiles(remote).includes('course/新しい教材.md'));
});

test('同期: 受講者の作業中のファイルと、自作のスキルは保存しない', () => {
  const { dir, remote } = setup();
  write(dir, 'docs/x.md', '書きかけ');
  git(dir, 'add', 'docs/x.md');
  write(dir, 'docs/新規.md', '未追跡');
  write(dir, '.claude/skills/mine/SKILL.md', '自作');
  syncRepo(dir, result(5));
  assert.equal(remoteShow(remote, 'docs/x.md'), '作業');
  assert.ok(!remoteFiles(remote).includes('docs/新規.md'));
  assert.ok(!remoteFiles(remote).includes('.claude/skills/mine/SKILL.md'));
  assert.equal(readFileSync(join(dir, 'docs/x.md'), 'utf8'), '書きかけ');
  assert.match(git(dir, 'status', '--porcelain', '--', 'docs/x.md'), /^M/);
});

test('同期: 本人が保存しただけの未送信のコミットがあるときは送らない', () => {
  const { dir, remote } = setup();
  write(dir, 'docs/x.md', '本人のコミット');
  git(dir, 'add', 'docs/x.md');
  git(dir, 'commit', '-q', '-m', '本人の作業');
  assert.deepEqual(syncRepo(dir, result(5)), { committed: true, pushed: false });
  assert.equal(remoteShow(remote, 'docs/x.md'), '作業');
});

test('同期: 前回送れなかった自動の保存は、次に送る', () => {
  const { dir, remote } = setup();
  git(dir, 'remote', 'set-url', 'origin', join(dirname(remote), 'missing.git'));
  assert.throws(() => syncRepo(dir, result(5)));
  git(dir, 'remote', 'set-url', 'origin', remote);
  assert.deepEqual(syncRepo(dir, result(5)), { committed: false, pushed: true });
  assert.ok(remoteFiles(remote).includes('progress.json'));
});
