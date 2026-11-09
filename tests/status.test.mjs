import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPage, selectInvitations, quietMembers, problemOf } from '../scripts/status.mjs';

const result = (currentStage, lastCommitDate = '2026-11-09T10:00:00+09:00') => ({
  stages: [
    { id: 0, title: '環境づくり', done: currentStage !== 0, missing: currentStage === 0 ? ['CLAUDE.md を書く'] : [] },
    { id: 1, title: '課題の洗い出し', done: currentStage === null, missing: currentStage === null ? [] : ['課題を書く'] },
  ],
  currentStage,
  lastCommitDate,
});
const member = (name, github, currentStage, problem = null, date) => ({ name, github, repo: `${github}/ai-course-x`, result: result(currentStage, date), problem });

test('並びは名前順で固定され、進み具合に左右されない', () => {
  const a = member('中村', 'nakamura', 0);
  const b = member('鈴木', 'suzuki', null);
  const one = renderPage([a, b]);
  const two = renderPage([b, a]);
  assert.equal(one, two);
  assert.ok(one.indexOf('中村') < one.indexOf('鈴木'));
});

test('課題の文は HTML エスケープする', () => {
  const html = renderPage([member('中村', 'nakamura', 1, '<script>alert(1)</script>')]);
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('動きがない人の表示はページに含まれない', () => {
  const html = renderPage([member('中村', 'nakamura', 1, null, '2026-10-01T10:00:00+09:00')]);
  assert.ok(!html.includes('2週間'));
  assert.ok(!html.includes('声をかける'));
});

test('段階ごとの人数を示す', () => {
  const html = renderPage([member('中村', 'nakamura', 1), member('鈴木', 'suzuki', 1), member('大東', 'ohigashi', 0)]);
  assert.match(html, /課題の洗い出し[^<]*<\/td>\s*<td[^>]*>2人/);
  assert.match(html, /環境づくり[^<]*<\/td>\s*<td[^>]*>1人/);
});

test('メンバーの招待だけを承諾の対象にする', () => {
  const invitations = [
    { id: 1, inviter: { login: 'nakamura-x' } },
    { id: 2, inviter: { login: 'stranger' } },
  ];
  assert.deepEqual(selectInvitations(invitations, [{ github: 'nakamura-x', name: '中村' }]).map((i) => i.id), [1]);
  assert.deepEqual(selectInvitations(invitations, []), []);
});

test('2週間以上 commit がない人を返す', () => {
  const now = new Date('2026-11-20T00:00:00+09:00');
  const list = quietMembers([
    member('中村', 'n', 1, null, '2026-11-01T00:00:00+09:00'),
    member('鈴木', 's', 1, null, '2026-11-15T00:00:00+09:00'),
  ], now);
  assert.deepEqual(list.map((m) => m.name), ['中村']);
});

test('「何が困っているか」の本文を取り出す。CRLF でも読める', () => {
  assert.equal(problemOf('## 誰の\r\n自分\r\n\r\n## 何が困っているか\r\n集計に時間がかかる\r\n\r\n## いまどうしているか\r\n手作業\r\n'), '集計に時間がかかる');
  assert.equal(problemOf('<!-- template -->\n## 何が困っているか\n\n'), null);
});

test('リポジトリがまだない人は開始前と表示する', () => {
  const html = renderPage([{ name: '鈴木', github: 's', repo: null, result: null, problem: null }]);
  assert.ok(html.includes('開始前'));
});
