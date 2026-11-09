// 大東の手元で実行し、メンバーのリポジトリに同じ判定をかけてチームのページを作る。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evaluate, createEnv, loadRules, sections } from './check.mjs';

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

function currentLabel(member) {
  if (!member.result) return '開始前';
  const { currentStage, stages } = member.result;
  if (currentStage === null) return '用意した段階をすべて完了';
  return stages.find((s) => s.id === currentStage).title;
}

const remaining = (member) => {
  const stage = member.result?.stages.find((s) => s.id === member.result.currentStage);
  return stage ? stage.missing : [];
};

export function renderPage(members) {
  const sorted = [...members].sort(byName);
  const counts = new Map();
  for (const m of sorted) counts.set(currentLabel(m), (counts.get(currentLabel(m)) ?? 0) + 1);
  const summary = [...counts].map(([label, n]) => `<tr><td>${escapeHtml(label)}</td><td class="n">${n}人</td></tr>`).join('');
  const rows = sorted.map((m) => `<tr>
<td>${escapeHtml(m.name)}</td>
<td>${escapeHtml(currentLabel(m))}</td>
<td>${remaining(m).map(escapeHtml).join('<br>') || '-'}</td>
<td>${m.problem ? escapeHtml(m.problem) : '-'}</td>
<td class="d">${m.result?.lastCommitDate ? escapeHtml(m.result.lastCommitDate.slice(0, 10)) : '-'}</td>
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
<h2>段階ごとの人数</h2>
<table><tbody>${summary}</tbody></table>
<h2>メンバー</h2>
<table><thead><tr><th>名前</th><th>いまの段階</th><th>残っていること</th><th>選んだ課題</th><th>最終更新</th></tr></thead>
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

function memberStatus(member, repos, rules, workDir) {
  const repo = repos.find((r) => r.owner.toLowerCase() === member.github.toLowerCase());
  if (!repo) return { ...member, repo: null, result: null, problem: null };
  const dir = join(workDir, member.github);
  gh('repo', 'clone', repo.full_name, dir, '--', '--quiet');
  const result = evaluate(dir, rules, createEnv(dir, { assumeInvited: true }));
  const problemPath = join(dir, 'docs', '01-problem.md');
  const problem = existsSync(problemPath) ? problemOf(readFileSync(problemPath, 'utf8')) : null;
  return { ...member, repo: repo.full_name, result, problem };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const members = JSON.parse(readFileSync(join(root, 'course', 'members.json'), 'utf8'));
  const workDir = mkdtempSync(join(tmpdir(), 'ai-course-status-'));
  try {
    acceptInvitations(members);
    const repos = courseRepos();
    const rules = loadRules();
    const statuses = members.map((m) => memberStatus(m, repos, rules, workDir));
    mkdirSync(join(root, 'out'), { recursive: true });
    const output = join(root, 'out', 'team.html');
    writeFileSync(output, renderPage(statuses));
    console.log(`チームのページを作りました: ${output}`);
    for (const m of [...statuses].sort(byName)) console.log(`${m.name}: ${currentLabel(m)}`);
    const quiet = quietMembers(statuses);
    if (quiet.length) console.log(`2週間以上更新がない人(声をかける候補): ${quiet.map((m) => m.name).join('、')}`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
