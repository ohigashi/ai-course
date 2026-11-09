import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { evaluate } from '../scripts/check.mjs';

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
