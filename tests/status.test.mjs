import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderPage, selectInvitations, quietMembers, problemOf, loadMembers, parseShare, renderTeamMd, teamInviteTargets, selectTeamInvitation } from '../scripts/status.mjs';

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

test('メンバーは手元のファイルから読み、無ければ空にする', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mem-'));
  assert.deepEqual(loadMembers(dir), []);
  writeFileSync(join(dir, 'members.local.json'), '[{"github":"a","name":"A"}]');
  assert.deepEqual(loadMembers(dir), [{ github: 'a', name: 'A' }]);
});

test('成果: 作ったもの、減らした時間、公開URLと月の合計を示し、本人の記録と添える', () => {
  const a = { ...member('中村', 'n', 1), outcome: { made: ['report.py'], monthlySavedHours: 6, url: 'https://example.com/<x>', stepups: 1 } };
  const b = { ...member('鈴木', 's', 1), outcome: { made: [], monthlySavedHours: 2.5, url: null, stepups: 0 } };
  const html = renderPage([a, b]);
  assert.ok(html.includes('report.py'));
  assert.ok(html.includes('8.5時間'));
  assert.ok(html.includes('本人の記録による'));
  assert.ok(html.includes('https://example.com/&lt;x&gt;'));
  assert.ok(html.includes('発展コース 1件'));
});

const shareOf = (over = {}) => ({ share: true, project: true, problem: '月末の集計に時間がかかる', made: '集計の自動化', ...over });

test('parseShare: true だけを了承とし、壊れたものは null', () => {
  assert.equal(parseShare('{ broken'), null);
  assert.equal(parseShare(null), null);
  assert.equal(parseShare('{"share":"true","project":1}').share, false);
  assert.equal(parseShare('{"share":"true","project":1}').project, false);
  assert.equal(parseShare('{"share":true}').share, true);
  assert.equal(parseShare('[1]'), null);
});

test('parseShare: 文は1行にして長さを制限する', () => {
  const s = parseShare(JSON.stringify({ share: true, problem: `a\nb${'x'.repeat(300)}`, made: 5 }));
  assert.ok(!s.problem.includes('\n'));
  assert.ok(s.problem.length <= 120);
  assert.equal(s.made, '');
});

test('TEAM.md: 了承した人だけを名前順で載せ、合計も了承した人だけで計算する', () => {
  const a = { ...member('鈴木', 's', 1), share: shareOf(), outcome: { made: ['secret-client.py', 'b'], monthlySavedHours: 2 } };
  const b = { ...member('中村', 'n', 0), share: shareOf({ problem: '営業資料の更新' }), outcome: { made: [], monthlySavedHours: 3 } };
  const c = { ...member('非共有', 'x', 1), share: shareOf({ share: false, problem: '見せない課題' }), outcome: { made: [], monthlySavedHours: 100 } };
  const d = { ...member('未回答', 'y', 1), share: null, outcome: { made: [], monthlySavedHours: 50 } };
  const md = renderTeamMd([a, c, d, b]);
  assert.ok(md.indexOf('中村') < md.indexOf('鈴木'));
  assert.ok(!md.includes('非共有') && !md.includes('見せない課題') && !md.includes('未回答'));
  assert.ok(md.includes('5時間'));
  assert.ok(!md.includes('105時間'));
  assert.ok(md.includes('営業資料の更新'));
  assert.ok(md.includes('2件'));
  assert.ok(md.includes('集計の自動化'));
  assert.ok(!md.includes('secret-client.py'));
  assert.ok(!md.includes('2週間'));
  assert.ok(!md.includes('CLAUDE.md を書く'));
});

test('招待の対象: どちらかの了承があり、まだ入っていない人', () => {
  const list = [
    { github: 'a', share: shareOf({ project: false }) },
    { github: 'b', share: shareOf({ share: false, project: true }) },
    { github: 'c', share: shareOf({ share: false, project: false }) },
    { github: 'd', share: shareOf() },
    { github: 'e', share: null },
  ];
  assert.deepEqual(teamInviteTargets(list, ['D']).map((m) => m.github), ['a', 'b']);
});

test('チームのリポジトリからの招待だけを選ぶ', () => {
  const invitations = [{ id: 1, repository: { full_name: 'o/team' } }, { id: 2, repository: { full_name: 'x/evil' } }];
  assert.deepEqual(selectTeamInvitation(invitations, 'o/team').map((i) => i.id), [1]);
});
