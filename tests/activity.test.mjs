import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordDay, parseActivity, activitySummary, LEGACY_PHASES } from '../scripts/activity.mjs';

const now = new Date('2026-11-30T12:00:00+09:00');

test('recordDay: 同じ日を重複させず並べる', () => {
  assert.deepEqual(recordDay(['2026-11-02'], '2026-11-01'), ['2026-11-01', '2026-11-02']);
  assert.deepEqual(recordDay(['2026-11-02'], '2026-11-02'), ['2026-11-02']);
});

test('parseActivity: 日付の形のものだけを読み、壊れていれば空', () => {
  assert.deepEqual(parseActivity('{"days":["2026-11-01","x",3]}'), ['2026-11-01']);
  assert.deepEqual(parseActivity('{ broken'), []);
  assert.deepEqual(parseActivity(null), []);
});

test('activitySummary: 週、今月と先月を返す', () => {
  const days = ['2026-10-05', '2026-10-20', '2026-11-05', '2026-11-12', '2026-11-20', '2026-11-29', '2026-11-30'];
  assert.deepEqual(activitySummary(days, now), { weekDays: 2, monthDays: 5, prevMonthDays: 2 });
  assert.deepEqual(activitySummary([], now), { weekDays: 0, monthDays: 0, prevMonthDays: 0 });
});

test('LEGACY_PHASES: 古い版の5段階の名前を保つ', () => {
  assert.equal(LEGACY_PHASES.length, 5);
  assert.ok(LEGACY_PHASES.includes('継続される'));
});

test('parseActivity: 重複と実在しない日付を除き、件数に上限を設ける', () => {
  assert.deepEqual(parseActivity('{"days":["2026-11-01","2026-11-01","2026-11-99","2026-02-30"]}'), ['2026-11-01']);
  const many = Array.from({ length: 5000 }, (_, i) => new Date(Date.UTC(2010, 0, 1 + i)).toISOString().slice(0, 10));
  const parsed = parseActivity(JSON.stringify({ days: many }));
  assert.equal(parsed.length, 3660);
  assert.equal(parsed.at(-1), many.at(-1));
});
