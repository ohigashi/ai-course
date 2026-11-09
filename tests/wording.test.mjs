import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['README.md', ...[0, 1, 2, 3, 4, 5, 6, 7].map((n) => `course/stage-${n}.md`), 'course/stepups/index.md', 'course/rules.json', '.claude/skills/next/SKILL.md', '.claude/skills/challenge/SKILL.md', '.claude/skills/course-status/SKILL.md', '.claude/skills/work/SKILL.md'];

test('受講者に見える文に「段階」を使わない', () => {
  for (const f of FILES) assert.ok(!readFileSync(join(root, f), 'utf8').replaceAll('二段階', '').includes('段階'), f);
});

test('活用日数は大東に見えるとは書かない', () => {
  for (const f of ['course/stage-0.md', '.claude/skills/next/SKILL.md']) {
    const t = readFileSync(join(root, f), 'utf8');
    assert.ok(t.includes('一覧には出しません'), f);
    assert.ok(!t.includes('活用した日付と日数も大東に見えます'), f);
  }
});

test('README のフェーズ名は「」で区切り、名前の中の読点と混ざらない', () => {
  assert.ok(readFileSync(join(root, 'README.md'), 'utf8').includes('「繰り返して慣れる、たくさん作る」'));
});

const read = (f) => readFileSync(join(root, f), 'utf8');

test('参加の前提は環境づくりだけで、順番を求める文がない', () => {
  for (const f of ['.claude/skills/challenge/SKILL.md', 'course/stage-6.md', 'course/stage-7.md', '.claude/skills/next/SKILL.md']) {
    assert.ok(!read(f).includes('課題の洗い出しを終え'), f);
    assert.ok(!read(f).includes('あとから始められる'), f);
  }
});

test('README: どこからでも始められ、繰り返せると書く', () => {
  assert.ok(read('README.md').includes('どのフェーズからでも'));
});

test('/next は /work と月1回の確認を案内する', () => {
  const t = read('.claude/skills/next/SKILL.md');
  assert.ok(t.includes('node scripts/work.mjs sync') && t.includes('node scripts/events.mjs due') && t.includes('`works.json`'));
});

test('共有の了承は /team に移り、works の了承を別に聞く', () => {
  const team = read('.claude/skills/team/SKILL.md');
  assert.ok(team.includes('- `works`: 取り組みの名前') && team.includes('`share`') && team.includes('`milestones`'));
  assert.ok(team.includes('works` の項目が無い'));
  const next = read('.claude/skills/next/SKILL.md');
  assert.ok(next.includes('`works`') && next.includes('はじめに:'));
});

test('取り組みの名前と次にやることが自動で共有されると、始める前に伝える', () => {
  for (const f of ['.claude/skills/work/SKILL.md', '.claude/skills/next/SKILL.md']) {
    const t = read(f);
    assert.ok(t.includes('自動で大東に共有') && t.includes('顧客名'), f);
  }
});

test('発展コースに時期の条件の列がない', () => {
  assert.ok(!read('course/stepups/index.md').includes('始められる時期'));
});

test('changelog の先頭は複数の取り組みの項目', () => {
  assert.ok(read('course/changelog.md').split('\n').find((l) => l.startsWith('## ')).includes('複数の取り組みを進められるようになりました'));
});
