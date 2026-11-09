import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { evaluate, readRepoFile, claudeMdStatus, reminderText, parseSavings, updateReminderText } from '../scripts/check.mjs';

const noRemote = { git: () => null, gh: () => null };

function repo(files, prefix = 'course-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  for (const [path, body] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

const stage = (id, checks) => ({ id, title: `段階${id}`, checks });
const longText = 'これは自分の仕事について書いた文章です。'.repeat(3);

test('file: 無いファイルは未完了', () => {
  const r = evaluate(repo({}), [stage(0, [{ type: 'file', path: 'CLAUDE.md', minChars: 20, label: 'CLAUDE.md を書く' }])], noRemote);
  assert.deepEqual(r.stages[0].missing, ['CLAUDE.md を書く']);
  assert.equal(r.stages[0].done, false);
});

test('file: ひな形の印が残っていると未完了', () => {
  const dir = repo({ 'CLAUDE.md': `<!-- template -->\n${longText}` });
  const r = evaluate(dir, [stage(0, [{ type: 'file', path: 'CLAUDE.md', minChars: 20, label: 'x' }])], noRemote);
  assert.equal(r.stages[0].done, false);
});

test('file: minChars 未満は未完了、以上は完了', () => {
  const rules = [stage(0, [{ type: 'file', path: 'a.md', minChars: 20, label: 'x' }])];
  assert.equal(evaluate(repo({ 'a.md': '短い' }), rules, noRemote).stages[0].done, false);
  assert.equal(evaluate(repo({ 'a.md': longText }), rules, noRemote).stages[0].done, true);
});

const problemCheck = { type: 'headings', path: 'p.md', headings: ['誰の', '何が困っているか'], minChars: 5, label: '課題を書く' };

test('headings: 見出しごとに本文があれば完了', () => {
  const body = '## 誰の\n経理の担当者です\n\n## 何が困っているか\n月末の集計に時間がかかる\n';
  assert.equal(evaluate(repo({ 'p.md': body }), [stage(1, [problemCheck])], noRemote).stages[0].done, true);
});

test('headings: 本文が短い見出しがあれば未完了', () => {
  const body = '## 誰の\n経理の担当者です\n\n## 何が困っているか\n\n';
  const r = evaluate(repo({ 'p.md': body }), [stage(1, [problemCheck])], noRemote);
  assert.equal(r.stages[0].done, false);
  assert.ok(r.stages[0].missing[0].includes('何が困っているか'));
});

test('headings: CRLF のファイルでも読める', () => {
  const body = '## 誰の\r\n経理の担当者です\r\n\r\n## 何が困っているか\r\n月末の集計に時間がかかる\r\n';
  assert.equal(evaluate(repo({ 'p.md': body }), [stage(1, [problemCheck])], noRemote).stages[0].done, true);
});

test('timed_items: 全角数字と「1時間半」を数え、時間のない行は数えない', () => {
  const rules = [stage(1, [{ type: 'timed_items', path: 't.md', min: 3, label: '業務を3件書く' }])];
  const ok = '- 売上の集計 30分\n- 請求書 1時間半\n* 日報 ３０分\n';
  assert.equal(evaluate(repo({ 't.md': ok }), rules, noRemote).stages[0].done, true);
  const ng = '- 売上の集計 30分\n- 請求書\n- 日報 ３０分\n';
  assert.equal(evaluate(repo({ 't.md': ng }), rules, noRemote).stages[0].done, false);
});

test('currentStage: 最初の未完了の段階を返し、全完了なら null', () => {
  const rules = [
    stage(0, [{ type: 'file', path: 'a.md', minChars: 5, label: 'a' }]),
    stage(1, [{ type: 'file', path: 'b.md', minChars: 5, label: 'b' }]),
  ];
  assert.equal(evaluate(repo({}), rules, noRemote).currentStage, 0);
  assert.equal(evaluate(repo({ 'a.md': longText }), rules, noRemote).currentStage, 1);
  assert.equal(evaluate(repo({ 'a.md': longText, 'b.md': longText }), rules, noRemote).currentStage, null);
});

test('pushed: 上流が無ければ未完了、差分なしなら完了', () => {
  const rules = [stage(0, [{ type: 'pushed', label: 'push する' }])];
  assert.equal(evaluate(repo({}), rules, noRemote).stages[0].done, false);
  const git = (args) => {
    if (args[0] === 'rev-parse') return 'abc';
    if (args[0] === 'status') return '# branch.oid x\n# branch.ab +0 -0\n';
    return null;
  };
  assert.equal(evaluate(repo({}), rules, { git, gh: () => null }).stages[0].done, true);
  const ahead = (args) => (args[0] === 'rev-parse' ? 'abc' : '# branch.ab +2 -0\n');
  assert.equal(evaluate(repo({}), rules, { git: ahead, gh: () => null }).stages[0].done, false);
});

const invited = [stage(0, [{ type: 'invited', github: 'ohigashi', label: '招待する' }])];
const remoteGit = (args) => (args[0] === 'remote' ? 'https://github.com/nakamura/ai-course-x.git' : null);

test('invited: gh が使えなくても落ちず、理由を返す', () => {
  const r = evaluate(repo({}), invited, { git: remoteGit, gh: () => null });
  assert.equal(r.stages[0].done, false);
  assert.ok(r.stages[0].missing[0].includes('GitHub CLI にログインしていない'));
});

test('invited: 招待中または共同編集者なら完了', () => {
  const pending = (args) => (args[1].endsWith('/invitations') ? JSON.stringify([{ invitee: { login: 'ohigashi' } }]) : '[]');
  assert.equal(evaluate(repo({}), invited, { git: remoteGit, gh: pending }).stages[0].done, true);
  const collab = (args) => (args[1].endsWith('/collaborators') ? JSON.stringify([{ login: 'ohigashi' }]) : '[]');
  assert.equal(evaluate(repo({}), invited, { git: remoteGit, gh: collab }).stages[0].done, true);
  const none = () => '[]';
  assert.equal(evaluate(repo({}), invited, { git: remoteGit, gh: none }).stages[0].done, false);
});

test('invited: assumeInvited なら完了', () => {
  assert.equal(evaluate(repo({}), invited, { ...noRemote, assumeInvited: true }).stages[0].done, true);
});

test('日本語と空白を含むパスでも動く', () => {
  const dir = repo({ 'a.md': longText }, '受講 者 ');
  const r = evaluate(dir, [stage(0, [{ type: 'file', path: 'a.md', minChars: 5, label: 'a' }])], noRemote);
  assert.equal(r.stages[0].done, true);
});

test('lastCommitDate は git の結果を返し、無ければ null', () => {
  assert.equal(evaluate(repo({}), [], noRemote).lastCommitDate, null);
  const git = (args) => (args[0] === 'log' ? '2026-11-09T10:00:00+09:00\n' : null);
  assert.equal(evaluate(repo({}), [], { git, gh: () => null }).lastCommitDate, '2026-11-09T10:00:00+09:00');
});

test('pushed: 書いた内容が未 commit なら未完了、教材の更新だけなら完了', () => {
  const rules = [stage(0, [{ type: 'pushed', label: 'push する' }])];
  const withStatus = (extra) => ({
    git: (args) => (args[0] === 'rev-parse' ? 'abc' : args[0] === 'status' ? `# branch.ab +0 -0\n${extra}` : null),
    gh: () => null,
  });
  assert.equal(evaluate(repo({}), rules, withStatus('1 .M N... 100644 100644 100644 a b CLAUDE.md\n')).stages[0].done, false);
  assert.equal(evaluate(repo({}), rules, withStatus('? docs/memo.md\n')).stages[0].done, false);
  assert.equal(evaluate(repo({}), rules, withStatus('1 M. N... 100644 100644 100644 a b course/stage-0.md\n1 M. N... 100644 100644 100644 a b .claude/skills/next/SKILL.md\n')).stages[0].done, true);
});

test('リポジトリの外を指すシンボリックリンクは読まない', () => {
  const outside = repo({ 'secret.md': longText });
  const dir = repo({});
  symlinkSync(join(outside, 'secret.md'), join(dir, 'a.md'));
  symlinkSync(outside, join(dir, 'linked'));
  assert.equal(readRepoFile(dir, 'a.md'), null);
  assert.equal(readRepoFile(dir, 'linked/secret.md'), null);
  const r = evaluate(dir, [stage(0, [{ type: 'file', path: 'a.md', minChars: 5, label: 'a' }])], noRemote);
  assert.equal(r.stages[0].done, false);
});

test('リポジトリの中の通常のファイルは読める', () => {
  assert.equal(readRepoFile(repo({ 'docs/a.md': '本文' }), 'docs/a.md'), '本文');
});

test('timed_items: 箇条書きでない行、番号、2h、半日も数え、見出しは数えない', () => {
  const rules = [stage(1, [{ type: 'timed_items', path: 't.md', min: 4, label: '業務' }])];
  const ok = '# 業務 30分\n・売上の集計 30分\n1. 請求書 2h\n日報 半日\n議事録 三十分\n';
  assert.equal(evaluate(repo({ 't.md': ok }), rules, noRemote).stages[0].done, true);
  const short = '# 業務 30分\n・売上の集計 30分\n1. 請求書 2h\n日報\n';
  assert.equal(evaluate(repo({ 't.md': short }), rules, noRemote).stages[0].done, false);
});

test('headings: 見出しごとに下限を変えられる', () => {
  const check = { type: 'headings', path: 'p.md', headings: ['誰の', '何が困っているか'], minChars: 10, minCharsBy: { '誰の': 2 }, label: 'x' };
  const ok = '## 誰の\n自分\n\n## 何が困っているか\n月末の集計に毎回2時間かかる\n';
  assert.equal(evaluate(repo({ 'p.md': ok }), [stage(1, [check])], noRemote).stages[0].done, true);
});

const claudeGit = (date, commits) => (args) => {
  if (args[0] === 'log' && args.includes('CLAUDE.md')) return `abc123 ${date}\n`;
  if (args[0] === 'rev-list') return `${commits}\n`;
  return null;
};
const now = new Date('2026-11-30T00:00:00+09:00');
const written = () => repo({ 'CLAUDE.md': `## 仕事\n${longText}` });

test('claudeMdStatus: 2週間たって作業があれば見直しの時期', () => {
  const s = claudeMdStatus(written(), { git: claudeGit('2026-11-09T00:00:00+09:00', 1), gh: () => null }, now);
  assert.equal(s.due, true);
  assert.equal(s.commitsSince, 1);
  assert.equal(s.daysSince, 21);
});

test('claudeMdStatus: 2週間たっても作業がなければ促さない', () => {
  assert.equal(claudeMdStatus(written(), { git: claudeGit('2026-11-09T00:00:00+09:00', 0), gh: () => null }, now).due, false);
});

test('claudeMdStatus: 日が浅くても作業の保存が10回たまれば促す', () => {
  assert.equal(claudeMdStatus(written(), { git: claudeGit('2026-11-29T00:00:00+09:00', 10), gh: () => null }, now).due, true);
  assert.equal(claudeMdStatus(written(), { git: claudeGit('2026-11-29T00:00:00+09:00', 9), gh: () => null }, now).due, false);
});

test('claudeMdStatus: ひな形のままや git が使えないときは促さない', () => {
  const tpl = repo({ 'CLAUDE.md': `<!-- template -->\n${longText}` });
  assert.equal(claudeMdStatus(tpl, { git: claudeGit('2026-11-01T00:00:00+09:00', 20), gh: () => null }, now).due, false);
  assert.equal(claudeMdStatus(written(), noRemote, now).due, false);
});

test('claudeMdStatus: 教材の更新は作業の回数に入れない', () => {
  const calls = [];
  const git = (args) => { calls.push(args); return claudeGit('2026-11-09T00:00:00+09:00', 1)(args); };
  claudeMdStatus(written(), { git, gh: () => null }, now);
  const revList = calls.find((a) => a[0] === 'rev-list');
  for (const p of [':!course', ':!scripts', ':!.claude']) assert.ok(revList.includes(p));
});

test('reminderText: 時期なら案内を返し、そうでなければ空', () => {
  assert.ok(reminderText({ due: true, daysSince: 21, commitsSince: 3 }).includes('/review-claude-md'));
  assert.equal(reminderText({ due: false }), '');
});

test('any_file: 中身のあるファイルが1つあれば完了し、目印だけでは未完了', () => {
  const rules = [stage(2, [{ type: 'any_file', dir: 'work', label: 'work に作る' }])];
  assert.equal(evaluate(repo({}), rules, noRemote).stages[0].done, false);
  assert.equal(evaluate(repo({ 'work/.gitkeep': '' }), rules, noRemote).stages[0].done, false);
  assert.equal(evaluate(repo({ 'work/sub/a.py': 'x' }), rules, noRemote).stages[0].done, true);
});

const savingsText = '1回あたりの時間(前): 2時間\n1回あたりの時間(後): 30分\n月の回数: ４回\n';

test('parseSavings: 前後の時間と月の回数から月の削減時間を計算する', () => {
  assert.deepEqual(parseSavings(savingsText), { beforeMin: 120, afterMin: 30, perMonth: 4, monthlySavedHours: 6 });
  assert.equal(parseSavings('1回あたりの時間(前): 分\n'), null);
  assert.equal(parseSavings('1回あたりの時間(前): 10分\n1回あたりの時間(後): 20分\n月の回数: 1回\n').monthlySavedHours, 0);
});

test('savings: 記録がそろっていれば完了', () => {
  const rules = [stage(2, [{ type: 'savings', path: 'l.md', label: '時間を記録する' }])];
  assert.equal(evaluate(repo({ 'l.md': savingsText }), rules, noRemote).stages[0].done, true);
  assert.equal(evaluate(repo({ 'l.md': '記録なし' }), rules, noRemote).stages[0].done, false);
});

test('url: URL が必要で、http が使えるときは応答も確かめ、使えないときは URL の有無だけを見る', () => {
  const rules = [stage(5, [{ type: 'url', path: 'u.md', label: '公開URLを書く' }])];
  const dir = repo({ 'u.md': '公開先: https://example.com/app\n' });
  assert.equal(evaluate(repo({ 'u.md': 'まだです' }), rules, noRemote).stages[0].done, false);
  assert.equal(evaluate(dir, rules, noRemote).stages[0].done, true);
  assert.equal(evaluate(dir, rules, { ...noRemote, http: () => 'HTTP/2 200\n' }).stages[0].done, true);
  assert.equal(evaluate(dir, rules, { ...noRemote, http: () => 'HTTP/2 301\nlocation: x\n\nHTTP/2 404\n' }).stages[0].done, false);
  assert.equal(evaluate(dir, rules, { ...noRemote, http: () => null }).stages[0].done, false);
});

test('updateReminderText: 更新があれば案内し、無ければ空', () => {
  assert.ok(updateReminderText('更新があります(版: abc)\nM\tcourse/stage-2.md\n').includes('/next'));
  assert.equal(updateReminderText('コースは最新です。\n'), '');
  assert.equal(updateReminderText(null), '');
});
