import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync, mkdirSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, loadRules } from '../scripts/check.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const noRemote = { git: () => null, gh: () => null };
const fileChecks = (rules) => rules.flatMap((r) => r.checks).filter((c) => c.path);

function templateCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'tpl-'));
  for (const c of fileChecks(loadRules())) {
    mkdirSync(dirname(join(dir, c.path)), { recursive: true });
    cpSync(join(root, c.path), join(dir, c.path));
  }
  return dir;
}

test('rules.json の全パスがひな形に存在する', () => {
  for (const c of fileChecks(loadRules())) assert.ok(existsSync(join(root, c.path)), c.path);
});

test('段階は0と1で、順に並ぶ', () => {
  assert.deepEqual(loadRules().map((r) => r.id), [0, 1]);
});

test('ひな形のままでは段階0も1も未完了', () => {
  const r = evaluate(templateCopy(), loadRules(), { ...noRemote, assumeInvited: true });
  assert.equal(r.currentStage, 0);
  assert.equal(r.stages[1].done, false);
});

test('記入済みの見本では段階0と1のファイルの条件を満たす', () => {
  const dir = templateCopy();
  writeFileSync(join(dir, 'CLAUDE.md'), ['仕事と役割', 'AIに任せたいこと', '文章や報告の好み', '確認してほしいタイミング', '大切にしている判断の基準'].map((h) => `## ${h}\n経理と総務の仕事について自分の言葉で書きました\n`).join('\n'));
  writeFileSync(join(dir, 'docs/01-tasks.md'), '- 売上の集計 2時間\n- 請求書の作成 30分\n- 議事録 1時間半\n');
  writeFileSync(join(dir, 'docs/01-problem.md'), [
    '## 誰の', '自分', '',
    '## 何が困っているか', '月末の売上の集計に毎回2時間かかる', '',
    '## いまどうしているか', '複数の表を手で貼り合わせている', '',
    '## どうなればよいか', '10分で集計が終わり確認だけで済む', '',
  ].join('\n'));
  const git = (args) => (args[0] === 'rev-parse' ? 'a' : args[0] === 'status' ? '# branch.ab +0 -0' : null);
  const r = evaluate(dir, loadRules(), { git, gh: () => null, assumeInvited: true });
  assert.deepEqual(r.stages.map((s) => s.missing), [[], []]);
  assert.equal(r.currentStage, null);
});

test('CLAUDE.md は印を消しただけでは未完了', () => {
  const dir = templateCopy();
  const text = readFileSync(join(dir, 'CLAUDE.md'), 'utf8').replace('<!-- template -->\n', '');
  writeFileSync(join(dir, 'CLAUDE.md'), text);
  const r = evaluate(dir, loadRules(), { ...noRemote, assumeInvited: true });
  assert.ok(r.stages[0].missing.some((m) => m.includes('CLAUDE.md')));
});
