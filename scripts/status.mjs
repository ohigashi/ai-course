// 大東の手元で実行し、メンバーのリポジトリに同じ判定をかけてチームのページを作る。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseMilestones, parseSnapshots, renderTimeline } from './history.mjs';
import { loadRoadmap } from './roadmap.mjs';
import { evaluate, createEnv, loadRules, loadConfig, sections, readRepoFile, listFiles, parseSavings, urlOf } from './check.mjs';
import { loadPhases, phaseOfStage } from './phases.mjs';
import { AUTO_SUBJECT, PROGRESS_FILE, applyProgress, nextActionOf, parseProgress } from './sync.mjs';

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byName = (a, b) => a.name.localeCompare(b.name, 'ja');

export const selectInvitations = (invitations, members) =>
  invitations.filter((i) => members.some((m) => m.github.toLowerCase() === i.inviter?.login?.toLowerCase()));

export function quietMembers(members, now = new Date()) {
  return members.filter((m) => m.result?.lastCommitDate && now - new Date(m.result.lastCommitDate) >= TWO_WEEKS_MS);
}

export function problemOf(text) {
  const body = sections(text.replace(/\r\n?/g, '\n')).get('何が困っているか') ?? '';
  const cleaned = body.replace(/<!--[\s\S]*?-->/g, '').trim();
  return cleaned || null;
}

// メンバーの名前は公開のリポジトリに入れない。手元のファイルから読む。
export function loadMembers(root) {
  const path = join(root, 'members.local.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
}

// 2人以下だと合計から個人の日数が分かるので、合計も出さない。
const TEAM_TOTAL_MIN_MEMBERS = 3;
const SHARE_TEXT_LIMIT = 120;
const shareText = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, SHARE_TEXT_LIMIT) : '');

// team-share.json を読む。true だけを了承として扱う。
export function parseShare(text) {
  if (text === null) return null;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const tips = Array.isArray(data.tips) ? data.tips.filter((t) => typeof t === 'string').map(shareText).filter(Boolean).slice(0, 5) : [];
  return { share: data.share === true, project: data.project === true, problem: shareText(data.problem), made: shareText(data.made), tips, milestones: data.milestones === true, declined: data.share === false && data.project === false };
}

export function teamInviteTargets(members, collaborators) {
  const joined = new Set(collaborators.map((c) => c.toLowerCase()));
  return members.filter((m) => (m.share?.share || m.share?.project) && !joined.has(m.github.toLowerCase()));
}

// 共有も参加もやめたと本人が記録した人だけを外す。未回答や取得の失敗では外さない。
export function teamRemoveTargets(members, collaborators, operator) {
  const joined = new Set(collaborators.map((c) => c.toLowerCase()));
  return members.filter((m) => m.share?.declined
    && joined.has(m.github.toLowerCase()) && m.github.toLowerCase() !== operator.toLowerCase());
}

export const selectTeamInvitation = (invitations, teamRepo) =>
  invitations.filter((i) => i.repository?.full_name?.toLowerCase() === teamRepo.toLowerCase());

export function renderTeamMd(members) {
  const shared = members.filter((m) => m.share?.share).sort(byName);
  const counts = new Map();
  for (const m of shared) counts.set(currentLabel(m), (counts.get(currentLabel(m)) ?? 0) + 1);
  const total = Math.round(shared.reduce((sum, m) => sum + (m.outcome?.monthlySavedHours ?? 0), 0) * 10) / 10;
  const weekTotal = shared.reduce((sum, m) => sum + (m.activity?.weekDays ?? 0), 0);
  const lines = [
    '# チームの進捗と成果', '',
    'このファイルは自動で作られます。手で編集しません。載っているのは、本人が了承した内容だけです。', '',
    '## 全体', '',
    ...[...counts].map(([label, n]) => `- ${label}: ${n}人`),
    `- 減らした時間の月合計: ${total}時間(本人の記録による)`,
    ...(shared.length >= TEAM_TOTAL_MIN_MEMBERS ? [`- 今週の活用: チーム合計 ${weekTotal}日`] : []), '',
    '## メンバー', '',
  ];
  for (const m of shared) {
    const count = m.outcome?.made?.length ?? 0;
    lines.push(`### ${m.name}`, '');
    lines.push(`- いまのフェーズ: ${currentLabel(m)}`);
    if (m.share.problem) lines.push(`- 取り組んでいる課題: ${m.share.problem}`);
    if (count || m.share.made) lines.push(`- 作ったもの: ${count}件${m.share.made ? `。${m.share.made}` : ''}`);
    if (m.outcome?.monthlySavedHours) lines.push(`- 減らした時間: 月 ${m.outcome.monthlySavedHours}時間`);
    const steps = m.share.milestones ? renderTimeline(m.milestones ?? [], loadRoadmap(), { phases: loadPhases(), mechanisms: [] }) : '';
    if (steps) lines.push('- これまでの歩み:', ...steps.split('\n').map((l) => `  - ${l}`));
    lines.push('');
  }
  const tips = shared.flatMap((m) => (m.share.tips ?? []).map((tip) => `- ${tip}(${m.name})`));
  if (tips.length) lines.push('## 効いた使い方', '', ...tips, '');
  return `${lines.join('\n').trimEnd()}\n`;
}

function currentLabel(member) {
  if (member.failed) return '取得できませんでした';
  if (!member.result) return '開始前';
  return phaseOfStage(member.result.currentStage, loadPhases())?.title ?? '取得できませんでした';
}

const remaining = (member) => {
  const stage = member.result?.stages.find((s) => s.id === member.result.currentStage);
  return stage ? stage.missing : [];
};

export function nextStepOf(member) {
  if (!member.result) return '-';
  return member.courseBehind ? 'コースの更新を /next で取り込む' : nextActionOf(member.result);
}

const RECENT_LIMIT = 3;
const AUTOMATIC_SUBJECTS = new Set([AUTO_SUBJECT, '歩みの更新', '活用の記録']);

// commit の件名を「日時<TAB>件名」の行から読む。自動の保存は動きに数えない。
export function recentMoves(log) {
  return log.split('\n').map((line) => {
    const tab = line.indexOf('\t');
    return tab < 0 ? null : { date: line.slice(0, tab), subject: line.slice(tab + 1).slice(0, 120) };
  }).filter((m) => m && !AUTOMATIC_SUBJECTS.has(m.subject)).slice(0, RECENT_LIMIT);
}

function stateNotes(member) {
  return [member.courseBehind ? '更新待ち' : '', member.synced === false ? '未同期(運営側の判定)' : ''].filter(Boolean);
}

const shortDate = (iso) => String(iso).slice(0, 16).replace('T', ' ');

function movesCell(member) {
  const last = member.result?.lastCommitDate ? [escapeHtml(shortDate(member.result.lastCommitDate))] : [];
  const moves = (member.recent ?? []).map((m) => `${escapeHtml(shortDate(m.date))} ${escapeHtml(m.subject)}`);
  return [...last, ...moves].join('<br>') || '-';
}

function outcomeCell(member) {
  const o = member.outcome;
  if (!o) return '-';
  const parts = [];
  if (o.made?.length) parts.push(`作ったもの: ${o.made.map(escapeHtml).join('、')}`);
  if (o.monthlySavedHours) parts.push(`減らした時間: 月 ${o.monthlySavedHours}時間`);
  if (o.url) parts.push(`公開: ${escapeHtml(o.url)}`);
  if (o.stepups) parts.push(`発展コース ${o.stepups}件`);
  return parts.join('<br>') || '-';
}

function journeyCell(member) {
  const text = member.milestones?.length ? renderTimeline(member.milestones, loadRoadmap(), { phases: loadPhases(), mechanisms: [] }) : '';
  const steps = text ? text.split('\n').map(escapeHtml) : [];
  const values = (member.snapshots ?? []).map((v) => `${escapeHtml(v.month)}: 作ったもの ${v.made}件、月 ${v.savedHours}時間`);
  return [...steps, ...values].join('<br>') || '-';
}

export function renderPage(members) {
  const sorted = [...members].sort(byName);
  const totalHours = Math.round(sorted.reduce((sum, m) => sum + (m.outcome?.monthlySavedHours ?? 0), 0) * 10) / 10;
  const counts = new Map();
  for (const m of sorted) counts.set(currentLabel(m), (counts.get(currentLabel(m)) ?? 0) + 1);
  const summary = [...counts].map(([label, n]) => `<tr><td>${escapeHtml(label)}</td><td class="n">${n}人</td></tr>`).join('');
  const rows = sorted.map((m) => `<tr>
<td>${escapeHtml(m.name)}</td>
<td>${escapeHtml(currentLabel(m))}${stateNotes(m).map((n) => `<br>${escapeHtml(n)}`).join('')}</td>
<td>${escapeHtml(nextStepOf(m))}</td>
<td>${remaining(m).map(escapeHtml).join('<br>') || '-'}</td>
<td>${m.problem ? escapeHtml(m.problem) : '-'}</td>
<td>${outcomeCell(m)}</td>
<td>${journeyCell(m)}</td>
<td class="d">${movesCell(m)}</td>
</tr>`).join('\n');
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>チームの進捗</title>
<style>
body{margin:0 auto;max-width:960px;padding:32px 16px;background:#fff;color:#22201c;font:15px/1.7 "Hiragino Sans","Yu Gothic",sans-serif;text-align:left}
h1{font-size:22px;margin:0 0 24px}h2{font-size:16px;margin:32px 0 8px}
table{width:100%;border-collapse:collapse}th,td{padding:8px 12px 8px 0;border-bottom:1px solid #d9d5cc;text-align:left;vertical-align:top}th{font-size:13px;border-bottom:1px solid #22201c}
.n,.d{white-space:nowrap}
</style></head><body>
<h1>チームの進捗</h1>
<h2>フェーズごとの人数</h2>
<table><tbody>${summary}</tbody></table>
<h2>減らした時間の月合計</h2>
<p>${totalHours}時間(本人の記録による)</p>
<h2>メンバー</h2>
<table><thead><tr><th>名前</th><th>いまのフェーズ</th><th>次の一歩</th><th>残っていること</th><th>選んだ課題</th><th>成果</th><th>これまでの歩み</th><th>最近の動き</th></tr></thead>
<tbody>
${rows}
</tbody></table>
</body></html>
`;
}

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function acceptInvitations(members) {
  const invitations = JSON.parse(gh('api', 'user/repository_invitations'));
  for (const invitation of selectInvitations(invitations, members)) {
    gh('api', '--method', 'PATCH', `user/repository_invitations/${invitation.id}`);
    console.log(`招待を承諾しました: ${invitation.repository?.full_name ?? invitation.id}`);
  }
}

function courseRepos() {
  return gh('api', '--paginate', 'user/repos?affiliation=owner,collaborator&per_page=100', '--jq', '.[] | {full_name, owner: .owner.login, topics}')
    .split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((r) => r.topics?.includes('ai-course'));
}

const changelogOf = (dir) => readRepoFile(dir, 'course/changelog.md')?.replace(/\r\n?/g, '\n') ?? null;

function memberStatus(member, repos, rules, workDir) {
  const repo = repos.find((r) => r.owner.toLowerCase() === member.github.toLowerCase());
  if (!repo) return { ...member, repo: null, result: null, problem: null };
  const dir = join(workDir, member.github);
  gh('repo', 'clone', repo.full_name, dir, '--', '--quiet');
  // 本人の手元の判定を正とする。まだ同期していない人だけ、運営側の判定を使う。
  const progress = parseProgress(readRepoFile(dir, PROGRESS_FILE), rules.map((r) => r.id));
  const result = applyProgress(evaluate(dir, rules, createEnv(dir, { assumeInvited: true })), progress);
  const courseBehind = changelogOf(dir) !== changelogOf(dirname(dirname(fileURLToPath(import.meta.url))));
  const recent = recentMoves(git(dir, 'log', '-20', '--format=%cI%x09%s'));
  const text = readRepoFile(dir, 'docs/01-problem.md');
  const problem = text === null ? null : problemOf(text);
  const log = readRepoFile(dir, 'docs/02-log.md');
  const launch = readRepoFile(dir, 'docs/05-launch.md');
  const outcome = {
    made: [...listFiles(dir, 'work'), ...listFiles(dir, 'app')].slice(0, 8),
    monthlySavedHours: log === null ? 0 : parseSavings(log)?.monthlySavedHours ?? 0,
    url: launch === null ? null : urlOf(launch),
    stepups: listFiles(dir, 'docs/stepups').length,
  };
  return { ...member, repo: repo.full_name, result, problem, outcome, synced: progress !== null, courseBehind, recent, share: parseShare(readRepoFile(dir, 'team-share.json')), activity: result.activity, milestones: parseMilestones(readRepoFile(dir, 'milestones.json')), snapshots: parseSnapshots(readRepoFile(dir, 'milestones.json')) };
}

export function shouldSyncTeam(members, login, operator) {
  return members.length > 0 && login.toLowerCase() === operator.toLowerCase();
}

// 1人の失敗で全体を止めない。失敗した人はチームに載せない。
export function collectStatuses(members, read) {
  return members.map((member) => {
    try {
      return read(member);
    } catch {
      console.log(`${member.name}: リポジトリを取得できませんでした`);
      return { ...member, repo: null, result: null, problem: null, share: null, failed: true };
    }
  });
}

const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// 了承した人を招待し、TEAM.md をチームのリポジトリへ反映する。
function syncTeam(statuses, teamRepo, operator, workDir) {
  const collaborators = JSON.parse(gh('api', `repos/${teamRepo}/collaborators`)).map((c) => c.login);
  for (const member of teamInviteTargets(statuses, collaborators)) {
    try {
      gh('api', '--method', 'PUT', `repos/${teamRepo}/collaborators/${member.github}`, '-f', 'permission=push');
      console.log(`チームのリポジトリに招待しました: ${member.name}`);
    } catch {
      console.log(`チームのリポジトリに招待できませんでした: ${member.name}`);
    }
  }
  for (const member of teamRemoveTargets(statuses, collaborators, operator)) {
    try {
      gh('api', '--method', 'DELETE', `repos/${teamRepo}/collaborators/${member.github}`);
      console.log(`チームのリポジトリから外しました: ${member.name}`);
    } catch {
      console.log(`チームのリポジトリから外せませんでした: ${member.name}`);
    }
  }
  const dir = join(workDir, '_team');
  gh('repo', 'clone', teamRepo, dir, '--', '--quiet');
  writeFileSync(join(dir, 'TEAM.md'), renderTeamMd(statuses));
  if (git(dir, 'status', '--porcelain').trim()) {
    git(dir, 'add', 'TEAM.md');
    git(dir, 'commit', '-q', '-m', 'TEAM.md を更新する');
    git(dir, 'push', '-q');
    console.log('TEAM.md を更新しました。');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const members = loadMembers(root);
  if (members.length === 0) console.log('members.local.json にメンバーがいません。');
  const workDir = mkdtempSync(join(tmpdir(), 'ai-course-status-'));
  try {
    acceptInvitations(members);
    const repos = courseRepos();
    const rules = loadRules();
    const statuses = collectStatuses(members, (m) => memberStatus(m, repos, rules, workDir));
    mkdirSync(join(root, 'out'), { recursive: true });
    const output = join(root, 'out', 'team.html');
    writeFileSync(output, renderPage(statuses));
    console.log(`チームのページを作りました: ${output}`);
    for (const m of [...statuses].sort(byName)) console.log(`${m.name}: ${currentLabel(m)}`);
    try {
      const config = loadConfig();
      if (shouldSyncTeam(members, gh('api', 'user', '--jq', '.login').trim(), config.operatorGithub)) {
        syncTeam(statuses, config.teamRepo, config.operatorGithub, workDir);
      }
    } catch {
      console.log('チームのリポジトリを更新できませんでした。');
    }
    const quiet = quietMembers(statuses);
    if (quiet.length) console.log(`2週間以上更新がない人(声をかける候補): ${quiet.map((m) => m.name).join('、')}`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
