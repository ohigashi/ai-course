import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whereCheck } from '../scripts/where.mjs';

test('Remote は止める', () => {
  const r = whereCheck({ remote: true, branch: 'claude/x' });
  assert.equal(r.stop, true);
  assert.ok(r.message.includes('Local'));
});

test('main 以外のブランチは止めずに知らせる', () => {
  const r = whereCheck({ remote: false, branch: 'try-chart' });
  assert.equal(r.stop, false);
  assert.ok(r.message.includes('try-chart') && r.message.includes('main'));
});

test('Local の main は何も言わない', () => assert.deepEqual(whereCheck({ remote: false, branch: 'main' }), { stop: false, message: '' }));

test('ブランチが分からないとき(git の外など)は止めず、何も言わない', () => assert.deepEqual(whereCheck({ remote: false, branch: null }), { stop: false, message: '' }));
