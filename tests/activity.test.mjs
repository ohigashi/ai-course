import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordDay, parseActivity, activitySummary, phaseOf, PHASES } from '../scripts/activity.mjs';

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

test('activitySummary: 週、4週の活動、今月と先月を返す', () => {
  const days = ['2026-10-05', '2026-10-20', '2026-11-05', '2026-11-12', '2026-11-20', '2026-11-29', '2026-11-30'];
  assert.deepEqual(activitySummary(days, now), { weekDays: 2, weeksActive: 4, monthDays: 5, prevMonthDays: 2, everContinued: true });
  assert.deepEqual(activitySummary([], now), { weekDays: 0, weeksActive: 0, monthDays: 0, prevMonthDays: 0, everContinued: false });
});

const r = (currentStage) => ({ currentStage });
const active = { weeksActive: 3 };
const quiet = { weeksActive: 1 };

test('phaseOf: 段階と活用の状況から5段階を返す', () => {
  assert.equal(PHASES.length, 5);
  assert.equal(phaseOf(r(0), quiet, 0), '学ぶ');
  assert.equal(phaseOf(r(1), active, 3), '学ぶ');
  assert.equal(phaseOf(r(2), active, 0), '試す');
  assert.equal(phaseOf(r(3), active, 0), '慣れる');
  assert.equal(phaseOf(r(3), quiet, 1), '仕組みとして実装する');
  assert.equal(phaseOf(r(4), quiet, 0), '仕組みとして実装する');
  assert.equal(phaseOf(r(null), quiet, 0), '仕組みとして実装する');
  assert.equal(phaseOf(r(4), active, 0), '継続される');
});

test('一度「継続される」に達したら、活用が減っても位置は戻らない', () => {
  const past = activitySummary(['2026-08-03', '2026-08-10', '2026-08-17'], now);
  assert.equal(past.weeksActive, 0);
  assert.equal(past.everContinued, true);
  assert.equal(phaseOf(r(4), past, 0), '継続される');
  assert.equal(activitySummary(['2026-08-03', '2026-10-10'], now).everContinued, false);
});

test('parseActivity: 重複と実在しない日付を除き、件数に上限を設ける', () => {
  assert.deepEqual(parseActivity('{"days":["2026-11-01","2026-11-01","2026-11-99","2026-02-30"]}'), ['2026-11-01']);
  const many = Array.from({ length: 5000 }, (_, i) => new Date(Date.UTC(2010, 0, 1 + i)).toISOString().slice(0, 10));
  const parsed = parseActivity(JSON.stringify({ days: many }));
  assert.equal(parsed.length, 3660);
  assert.equal(parsed.at(-1), many.at(-1));
});
