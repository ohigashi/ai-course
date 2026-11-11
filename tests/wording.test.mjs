import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['README.md', ...[0, 1, 2, 3, 4, 5, 6, 7].map((n) => `course/stage-${n}.md`), 'course/stepups/index.md', 'course/rules.json', '.claude/skills/next/SKILL.md', '.claude/skills/challenge/SKILL.md', '.claude/skills/course-status/SKILL.md', '.claude/skills/work/SKILL.md', '.claude/skills/goal/SKILL.md'];

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

test('changelog に複数の取り組みの項目があり、先頭は Web の項目', () => {
  const headings = read('course/changelog.md').split('\n').filter((l) => l.startsWith('## '));
  assert.ok(headings[0].includes('Webで見られるようになりました'));
  assert.ok(headings.some((l) => l.includes('複数の取り組みを進められるようになりました')));
});

test('課題の洗い出しを終えることを条件にする文がない', () => {
  for (const f of [...FILES, '.claude/skills/team/SKILL.md', '.claude/skills/log/SKILL.md']) {
    const t = read(f);
    for (const bad of ['課題の洗い出し」を終えたら', '課題の洗い出し」を終えた受講者', '課題の洗い出しを終え']) assert.ok(!t.includes(bad), `${f}: ${bad}`);
  }
});

test('/next: 取り組みの場所、redo の提案、月1回の確認、共有の注意を書く', () => {
  const t = read('.claude/skills/next/SKILL.md');
  for (const key of ['works/<slug>/', 'work.mjs move', '`redo`', 'events.mjs add asked', 'events.mjs add running', '顧客名', '`works.json` が新しく作られる']) assert.ok(t.includes(key), key);
  assert.ok(read('.claude/skills/work/SKILL.md').includes('works/<slug>/'));
  assert.ok(read('.claude/skills/log/SKILL.md').includes('events.mjs add delegated'));
});

test('目標の見直しの文に、説明用の言葉(現在地、目的地など)を使わない', () => {
  // 更新の記録は配布済みの項目を書き換えないので、いちばん新しい項目だけを見る。
  const latestChange = read('course/changelog.md').split('\n## ')[1];
  const texts = { ...Object.fromEntries(['.claude/skills/goal/SKILL.md', '.claude/skills/next/SKILL.md', 'course/abilities.json'].map((f) => [f, read(f)])), changelog: latestChange };
  for (const [f, text] of Object.entries(texts)) {
    for (const w of ['現在地', '目的地', '体感', '差分', '立ち位置', '手応え']) assert.ok(!text.includes(w), `${f}: ${w}`);
  }
});

test('/next は最初に where.mjs を実行し、月に1回だけ目標の見直しを聞く', () => {
  const t = read('.claude/skills/next/SKILL.md');
  assert.ok(t.includes('node scripts/where.mjs') && t.includes('node scripts/events.mjs due review') && t.includes('/goal'));
});

test('目標の文と自己評価は、大東の一覧と Web に送らない', () => {
  for (const f of ['scripts/status.mjs', 'scripts/sync.mjs']) {
    assert.ok(!read(f).includes('goals.md') && !read(f).includes('ratings'), f);
  }
});

test('/goal は自己評価を合計や平均にせず、本人だけに残すと伝える', () => {
  const t = read('.claude/skills/goal/SKILL.md');
  assert.ok(t.includes('合計しない') && t.includes('誰にも見えない') && t.includes('顧客名'));
});
