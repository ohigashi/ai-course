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

const sourceOf = (path) => (existsSync(join(root, path)) ? join(root, path) : join(root, 'course', 'templates', path.split('/').pop()));

function templateCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'tpl-'));
  for (const c of fileChecks(loadRules())) {
    mkdirSync(dirname(join(dir, c.path)), { recursive: true });
    cpSync(sourceOf(c.path), join(dir, c.path));
  }
  return dir;
}

test('rules.json の全パスがひな形に存在する', () => {
  for (const c of fileChecks(loadRules())) assert.ok(existsSync(sourceOf(c.path)), c.path);
});

test('段階は0から5まで順に並ぶ', () => {
  assert.deepEqual(loadRules().map((r) => r.id), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(loadRules().find((r) => r.id === 6).optional, true);
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
  assert.deepEqual(r.stages.slice(0, 2).map((s) => s.missing), [[], []]);
  assert.equal(r.currentStage, 2);
});

test('CLAUDE.md は印を消しただけでは未完了', () => {
  const dir = templateCopy();
  const text = readFileSync(join(dir, 'CLAUDE.md'), 'utf8').replace('<!-- template -->\n', '');
  writeFileSync(join(dir, 'CLAUDE.md'), text);
  const r = evaluate(dir, loadRules(), { ...noRemote, assumeInvited: true });
  assert.ok(r.stages[0].missing.some((m) => m.includes('CLAUDE.md')));
});

test('ひな形の docs は段階2以降でも未完了', () => {
  const r = evaluate(templateCopy(), loadRules(), { ...noRemote, assumeInvited: true });
  for (const id of [2, 3, 4, 5]) assert.equal(r.stages.find((x) => x.id === id).done, false);
});

test('全段階の教材と、発展コースの一覧の全ファイルがある', () => {
  for (const id of [0, 1, 2, 3, 4, 5, 6]) assert.ok(existsSync(join(root, 'course', `stage-${id}.md`)), `stage-${id}`);
  const index = readFileSync(join(root, 'course/stepups/index.md'), 'utf8');
  const files = [...index.matchAll(/`([a-z-]+\.md)`/g)].map((m) => m[1]);
  assert.ok(files.length >= 5);
  for (const f of files) assert.ok(existsSync(join(root, 'course/stepups', f)), f);
});

test('進み具合の条件に push を入れない', () => {
  assert.ok(!loadRules().flatMap((r) => r.checks).some((c) => c.type === 'pushed'));
});

test('.gitignore で .local を除外している', () => {
  assert.ok(readFileSync(join(root, '.gitignore'), 'utf8').split('\n').includes('.local/'));
});
