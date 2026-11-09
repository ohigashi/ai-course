import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderRoadmap, statusLine, loadRoadmap } from '../scripts/roadmap.mjs';

const roadmap = [
  { id: 0, title: '環境づくり', goal: '作業場所を持つ' },
  { id: 1, title: '課題の洗い出し', goal: '課題を選ぶ' },
  { id: 2, title: '小さな自動化', goal: '1つ回す' },
];
const result = (currentStage, missing = ['docs/01-tasks.md を書く']) => ({
  stages: [
    { id: 0, title: '環境づくり', done: currentStage !== 0, missing: currentStage === 0 ? missing : [] },
    { id: 1, title: '課題の洗い出し', done: currentStage === null, missing: currentStage === 1 ? missing : [] },
  ],
  currentStage,
});

test('全体像: 済んだ段階、いまの段階、これからの段階を示す', () => {
  const lines = renderRoadmap(result(1), roadmap).split('\n');
  assert.match(lines.find((l) => l.includes('環境づくり')), /^済/);
  assert.match(lines.find((l) => l.includes('課題の洗い出し')), /いまここ/);
  assert.ok(!lines.find((l) => l.includes('小さな自動化')).includes('いまここ'));
  assert.ok(lines.find((l) => l.includes('小さな自動化')).includes('1つ回す'));
});

test('全体像: 用意した段階を終えたら、次の準備中の段階をいまとする', () => {
  const line = renderRoadmap(result(null), roadmap).split('\n').find((l) => l.includes('小さな自動化'));
  assert.match(line, /いまここ/);
  assert.match(line, /準備中/);
});

test('画面下の表示: 何段階目かと、次にやることを1行で返す', () => {
  const line = statusLine(result(1), roadmap);
  assert.ok(line.startsWith('コース 2/3 課題の洗い出し'));
  assert.ok(line.includes('次: docs/01-tasks.md を書く'));
  assert.ok(!line.includes('\n'));
});

test('画面下の表示: 準備中の段階では次の案内を出さない', () => {
  assert.equal(statusLine(result(null), roadmap), 'コース 3/3 小さな自動化(準備中)');
});

test('コースの全体は基本の6段階と並行のチームで作る', () => {
  assert.deepEqual(loadRoadmap().map((s) => s.title), ['環境づくり', '課題の洗い出し', '小さな自動化', 'プロダクト化', 'アプリ開発', '公開と運用', 'チームで作る']);
});

const withTeam = [...roadmap, { id: 6, title: 'チームで作る', goal: '共同で作る', optional: true, availableAfter: 1 }];

test('並行の段階は分母に数えず、参加できる時期を示す', () => {
  assert.ok(statusLine(result(1), withTeam).startsWith('コース 2/3 '));
  const early = renderRoadmap(result(1), withTeam).split('\n').find((l) => l.includes('チームで作る'));
  assert.match(early, /^-/);
  assert.match(early, /段階1のあとに参加できます/);
  const open = renderRoadmap(result(null), withTeam).split('\n').find((l) => l.includes('チームで作る'));
  assert.match(open, /^可/);
  assert.ok(!open.includes('いまここ'));
});
