import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPhases, phaseOfStage } from '../scripts/phases.mjs';
import { recentMoves, renderPage, selectInvitations, quietMembers, problemOf, loadMembers, parseShare, renderTeamMd, teamInviteTargets, selectTeamInvitation, shouldSyncTeam, collectStatuses, teamRemoveTargets } from '../scripts/status.mjs';

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
  const a = member('受講者A', 'nakamura', 0);
  const b = member('受講者B', 'suzuki', null);
  const one = renderPage([a, b]);
  const two = renderPage([b, a]);
  assert.equal(one, two);
  assert.ok(one.indexOf('受講者A') < one.indexOf('受講者B'));
});

test('課題の文は HTML エスケープする', () => {
  const html = renderPage([member('受講者A', 'nakamura', 1, '<script>alert(1)</script>')]);
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('動きがない人の表示はページに含まれない', () => {
  const html = renderPage([member('受講者A', 'nakamura', 1, null, '2026-10-01T10:00:00+09:00')]);
  assert.ok(!html.includes('2週間'));
  assert.ok(!html.includes('声をかける'));
});

test('フェーズごとの人数を示す', () => {
  const html = renderPage([member('受講者A', 'nakamura', 1), member('受講者B', 'suzuki', 1), member('大東', 'ohigashi', null)]);
  const P = loadPhases();
  assert.match(html, new RegExp(`${phaseOfStage(1, P).title}[^<]*</td>\\s*<td[^>]*>2人`));
  assert.match(html, new RegExp(`${phaseOfStage(null, P).title}[^<]*</td>\\s*<td[^>]*>1人`));
  assert.ok(html.includes('フェーズごとの人数'));
});
test('一覧: 不明な段階の番号でも落とさず取得できませんでしたと出す', () => {
  assert.ok(renderPage([member('受講者A', 'n', 999)]).includes('取得できませんでした'));
});

test('メンバーの招待だけを承諾の対象にする', () => {
  const invitations = [
    { id: 1, inviter: { login: 'nakamura-x' } },
    { id: 2, inviter: { login: 'stranger' } },
  ];
  assert.deepEqual(selectInvitations(invitations, [{ github: 'nakamura-x', name: '受講者A' }]).map((i) => i.id), [1]);
  assert.deepEqual(selectInvitations(invitations, []), []);
});

test('2週間以上 commit がない人を返す', () => {
  const now = new Date('2026-11-20T00:00:00+09:00');
  const list = quietMembers([
    member('受講者A', 'n', 1, null, '2026-11-01T00:00:00+09:00'),
    member('受講者B', 's', 1, null, '2026-11-15T00:00:00+09:00'),
  ], now);
  assert.deepEqual(list.map((m) => m.name), ['受講者A']);
});

test('「何が困っているか」の本文を取り出す。CRLF でも読める', () => {
  assert.equal(problemOf('## 誰の\r\n自分\r\n\r\n## 何が困っているか\r\n集計に時間がかかる\r\n\r\n## いまどうしているか\r\n手作業\r\n'), '集計に時間がかかる');
  assert.equal(problemOf('<!-- template -->\n## 何が困っているか\n\n'), null);
});

test('リポジトリがまだない人は開始前と表示する', () => {
  const html = renderPage([{ name: '受講者B', github: 's', repo: null, result: null, problem: null }]);
  assert.ok(html.includes('開始前'));
});

test('メンバーは手元のファイルから読み、無ければ空にする', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mem-'));
  assert.deepEqual(loadMembers(dir), []);
  writeFileSync(join(dir, 'members.local.json'), '[{"github":"a","name":"A"}]');
  assert.deepEqual(loadMembers(dir), [{ github: 'a', name: 'A' }]);
});

test('成果: 作ったもの、減らした時間、公開URLと月の合計を示し、本人の記録と添える', () => {
  const a = { ...member('受講者A', 'n', 1), outcome: { made: ['report.py'], monthlySavedHours: 6, url: 'https://example.com/<x>', stepups: 1 } };
  const b = { ...member('受講者B', 's', 1), outcome: { made: [], monthlySavedHours: 2.5, url: null, stepups: 0 } };
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
  const a = { ...member('受講者B', 's', 1), share: shareOf(), outcome: { made: ['secret-client.py', 'b'], monthlySavedHours: 2 } };
  const b = { ...member('受講者A', 'n', 0), share: shareOf({ problem: '営業資料の更新' }), outcome: { made: [], monthlySavedHours: 3 } };
  const c = { ...member('非共有', 'x', 1), share: shareOf({ share: false, problem: '見せない課題' }), outcome: { made: [], monthlySavedHours: 100 } };
  const d = { ...member('未回答', 'y', 1), share: null, outcome: { made: [], monthlySavedHours: 50 } };
  const md = renderTeamMd([a, c, d, b]);
  assert.ok(md.indexOf('受講者A') < md.indexOf('受講者B'));
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

test('チームへの反映は、メンバーがいて運営者本人が実行したときだけ', () => {
  const members = [{ github: 'a' }];
  assert.equal(shouldSyncTeam(members, 'ohigashi', 'ohigashi'), true);
  assert.equal(shouldSyncTeam(members, 'OHIGASHI', 'ohigashi'), true);
  assert.equal(shouldSyncTeam([], 'ohigashi', 'ohigashi'), false);
  assert.equal(shouldSyncTeam(members, 'student', 'ohigashi'), false);
});

test('1人の取得に失敗しても他の人を集計し、失敗した人はチームに載せない', () => {
  const list = collectStatuses([{ name: 'A', github: 'a' }, { name: 'B', github: 'b' }], (m) => {
    if (m.github === 'a') throw new Error('clone failed');
    return { ...m, result: result(1), share: shareOf(), outcome: { made: [], monthlySavedHours: 1 } };
  });
  assert.equal(list.length, 2);
  assert.equal(list[0].failed, true);
  assert.equal(list[0].share, null);
  assert.ok(renderTeamMd(list).includes('### B'));
  assert.ok(!renderTeamMd(list).includes('### A'));
  assert.ok(renderPage(list).includes('A'));
});

test('TEAM.md: 活用日数はチームの合計だけで、個人別には出さない', () => {
  const a = { ...member('受講者A', 'n', 1), share: shareOf(), outcome: { made: [], monthlySavedHours: 0 }, activity: { weekDays: 4 } };
  const b = { ...member('受講者B', 's', 1), share: shareOf(), outcome: { made: [], monthlySavedHours: 0 }, activity: { weekDays: 3 } };
  const c = { ...member('非共有', 'x', 1), share: shareOf({ share: false }), outcome: { made: [], monthlySavedHours: 0 }, activity: { weekDays: 5 } };
  const d = { ...member('大東', 'o', 1), share: shareOf(), outcome: { made: [], monthlySavedHours: 0 }, activity: { weekDays: 1 } };
  const md = renderTeamMd([a, b, c, d]);
  assert.ok(md.includes('今週の活用: チーム合計 8日'));
  assert.ok(!md.includes('4日') && !md.includes('3日'));
  assert.ok(!renderTeamMd([a, b]).includes('チーム合計 7日'));
});

test('TEAM.md: 本人が選んだ効いた使い方と、いまのフェーズを載せる', () => {
  const a = { ...member('受講者A', 'n', 1), share: { ...shareOf(), tips: ['資料と台本を一緒に渡す'] }, phase: '試す', outcome: { made: [], monthlySavedHours: 0 } };
  const md = renderTeamMd([a]);
  assert.ok(md.includes('資料と台本を一緒に渡す'));
  assert.ok(md.includes(`- いまのフェーズ: ${phaseOfStage(1, loadPhases()).title}`));
});

test('parseShare: tips は文字列だけを5件まで', () => {
  const s = parseShare(JSON.stringify({ share: true, tips: ['a', 1, 'b', 'c', 'd', 'e', 'f'] }));
  assert.deepEqual(s.tips, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(parseShare('{"share":true}').tips, []);
});

test('チームから外す対象: どちらもやめた人だけで、未回答や失敗や運営者は外さない', () => {
  const list = [
    { github: 'quit', share: shareOf({ share: false, project: false , declined: true }) },
    { github: 'keep', share: shareOf({ share: false, project: true }) },
    { github: 'none', share: null },
    { github: 'fail', share: null, failed: true },
    { github: 'owner', share: shareOf({ share: false, project: false , declined: true }) },
    { github: 'gone', share: shareOf({ share: false, project: false , declined: true }) },
  ];
  assert.deepEqual(teamRemoveTargets(list, ['QUIT', 'keep', 'none', 'fail', 'owner'], 'owner').map((m) => m.github), ['quit']);
});

test('運営のページ: 人別の活用日数と月別の推移を出さない', () => {
  const a = { ...member('受講者A', 'n', 1), outcome: { made: [], monthlySavedHours: 0 }, activity: { weekDays: 4, monthDays: 9 }, milestones: [{ key: 'stage:0', date: '2026-11-09' }], months: [{ month: '2026-11', days: 12 }] };
  const html = renderPage([a]);
  assert.ok(!html.includes('週 4日') && !html.includes('今月 9日') && !html.includes('12日'));
  assert.ok(html.includes('2026-11-09'));
  assert.ok(html.includes('フェーズごとの人数'));
});
test('一覧: 古い版の受講者でも段階の番号から今のフェーズが出る', () => {
  const a = { ...member('受講者A', 'n', 1), phase: '仕組みとして実装する', outcome: { made: [], monthlySavedHours: 0 } };
  const html = renderPage([a]);
  assert.ok(html.includes(phaseOfStage(1, loadPhases()).title));
  assert.ok(!html.includes('仕組みとして実装する'));
});

test('チームから外すのは、両方を false と明示した人だけ', () => {
  assert.equal(parseShare('{"share":false,"project":false}').declined, true);
  for (const text of ['{}', '{"share":"true","project":"true"}', '{"tips":["a"]}', '{"share":false}']) {
    const m = { github: 'a', share: parseShare(text) };
    assert.deepEqual(teamRemoveTargets([m], ['a'], 'owner'), [], text);
  }
});

test('TEAM.md: いまのフェーズを1行で示し、活用の位置を出さない', () => {
  const a = { ...member('受講者A', 'n', 1), share: shareOf(), phase: '継続される', outcome: { made: [], monthlySavedHours: 0 } };
  const md = renderTeamMd([a]);
  assert.ok(md.includes(`- いまのフェーズ: ${phaseOfStage(1, loadPhases()).title}`));
  assert.ok(!md.includes('継続される') && !md.includes('いまの段階'));
});

test('TEAM.md: 了承者の節目の日付を載せ、活用の推移は載せない', () => {
  const a = { ...member('受講者A', 'n', 1), share: shareOf({ milestones: true }), outcome: { made: [], monthlySavedHours: 0 }, milestones: [{ key: 'level:1', date: '2026-11-10' }, { key: 'phase:継続される', date: '2026-11-11' }], months: [{ month: '2026-11', days: 12 }] };
  const md = renderTeamMd([a]);
  assert.ok(!renderTeamMd([{ ...a, share: shareOf() }]).includes('2026-11-10'));
  assert.ok(md.includes('2026-11-10') && md.includes('課題解決 レベル1'));
  assert.ok(!md.includes('継続される') && !md.includes('2026-11-11'));
  assert.ok(!md.includes('12日'));
});

test('parseShare: 節目の掲載は明示の了承だけ', () => {
  assert.equal(parseShare('{"share":true}').milestones, false);
  assert.equal(parseShare('{"share":true,"milestones":true}').milestones, true);
});

test('運営のページ: 作ったものと減らした時間の変化を示す', () => {
  const a = { ...member('受講者A', 'n', 1), outcome: { made: [], monthlySavedHours: 0 }, snapshots: [{ month: '2026-11', made: 3, savedHours: 6 }] };
  assert.ok(renderPage([a]).includes('作ったもの 3件'));
});

test('recentMoves: 自動の保存と活用の記録は除き、作業の件名は残す', () => {
  const log = ['2026-11-09T10:00:00\t活用の記録', '2026-11-09T09:00:00\t歩みの更新', '2026-11-08T09:00:00\t議事録の自動化を作った'].join('\n');
  assert.deepEqual(recentMoves(log).map((m) => m.subject), ['議事録の自動化を作った']);
});
