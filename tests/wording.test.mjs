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
