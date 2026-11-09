// コースの完了条件を判定する。AI を使わず、リポジトリの中身だけで決める。
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, lstatSync, realpathSync, readdirSync } from 'node:fs';
import { join, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRoadmap, renderRoadmap } from './roadmap.mjs';

const TEMPLATE_MARK = '<!-- template -->';
const COURSE_PATHS = ['course/', 'scripts/', '.claude/'];
const TIME_PATTERN = /\d+\s*(分|時間|h\b|min)|半日|[一二三四五六七八九十]+\s*(分|時間)/i;

// 他の人のリポジトリも読むので、シンボリックリンクでリポジトリの外を読まない。
export function readRepoFile(repoDir, path) {
  const full = join(repoDir, path);
  if (!existsSync(full) || !lstatSync(full).isFile()) return null;
  const inside = relative(realpathSync(repoDir), realpathSync(full));
  if (inside.startsWith('..') || isAbsolute(inside)) return null;
  return readFileSync(full, 'utf8');
}

function readDoc(repoDir, path) {
  const raw = readRepoFile(repoDir, path);
  if (raw === null) return null;
  const text = raw.replace(/\r\n?/g, '\n');
  return text.includes(TEMPLATE_MARK) ? null : text;
}

const countChars = (text) => text.replace(/<!--[\s\S]*?-->/g, '').replace(/\s/g, '').length;

export function sections(text) {
  const result = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1];
      result.set(current, '');
    } else if (current !== null) {
      result.set(current, `${result.get(current)}${line}\n`);
    }
  }
  return result;
}

const toHalfWidthDigits = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

function checkHeadings(repoDir, check) {
  const text = readDoc(repoDir, check.path);
  if (text === null) return [check.label];
  const found = sections(text);
  return check.headings
    .filter((h) => countChars(found.get(h) ?? '') < (check.minCharsBy?.[h] ?? check.minChars))
    .map((h) => `${check.label}(「${h}」の内容)`);
}

function checkTimedItems(repoDir, check) {
  const text = readDoc(repoDir, check.path);
  if (text === null) return [check.label];
  const count = text
    .split('\n')
    .filter((line) => !/^\s*(#|<!--)/.test(line) && TIME_PATTERN.test(toHalfWidthDigits(line))).length;
  return count >= check.min ? [] : [`${check.label}(いま ${count} 件)`];
}

const PLACEHOLDER_FILES = new Set(['.gitkeep', 'README.md']);

export function listFiles(repoDir, dir) {
  const full = join(repoDir, dir);
  if (!existsSync(full) || !lstatSync(full).isDirectory()) return [];
  return readdirSync(full, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && !PLACEHOLDER_FILES.has(e.name) && !`${e.parentPath}`.includes('node_modules'))
    .map((e) => e.name);
}

function minutesOf(label, text) {
  const match = toHalfWidthDigits(text).match(new RegExp(`${label}\\s*[:：]\\s*([\\d.]+)\\s*(分|時間)`));
  if (!match) return null;
  return match[2] === '時間' ? Number(match[1]) * 60 : Number(match[1]);
}

export function parseSavings(text) {
  const beforeMin = minutesOf('1回あたりの時間\\(前\\)', text);
  const afterMin = minutesOf('1回あたりの時間\\(後\\)', text);
  const count = toHalfWidthDigits(text).match(/月の回数\s*[:：]\s*(\d+)/);
  if (beforeMin === null || afterMin === null || !count) return null;
  const perMonth = Number(count[1]);
  const saved = Math.max(0, beforeMin - afterMin) * perMonth;
  return { beforeMin, afterMin, perMonth, monthlySavedHours: Math.round((saved / 60) * 10) / 10 };
}

export const urlOf = (text) => text.match(/https?:\/\/[^\s)>"'、。]+/)?.[0] ?? null;

function checkUrl(repoDir, check, env) {
  const text = readDoc(repoDir, check.path);
  const url = text === null ? null : urlOf(text);
  if (!url) return [check.label];
  if (!env.http) return [];
  const statuses = [...(env.http(url) ?? '').matchAll(/HTTP\/[\d.]+ (\d{3})/g)];
  const last = statuses.at(-1)?.[1];
  return last && /^[23]/.test(last) ? [] : [`${check.label}(URL に届きません)`];
}

function checkPushed(env, check) {
  if (env.git(['rev-parse', '@{u}']) === null) return [check.label];
  const status = env.git(['status', '--porcelain=v2', '--branch']) ?? '';
  const uncommitted = status.split('\n').filter((line) => /^[12?u] /.test(line)).map((line) => line.split(' ').pop());
  const ownChanges = uncommitted.filter((path) => !COURSE_PATHS.some((p) => path.startsWith(p)));
  return /branch\.ab \+0 -0/.test(status) && ownChanges.length === 0 ? [] : [check.label];
}

function repoSlug(env) {
  const url = env.git(['remote', 'get-url', 'origin']);
  const match = url?.trim().match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  return match ? `${match[1]}/${match[2]}` : null;
}

function checkInvited(env, check) {
  if (env.assumeInvited) return [];
  const slug = repoSlug(env);
  if (!slug) return [`${check.label}(GitHub のリポジトリとつながっていません)`];
  const invitations = env.gh(['api', `repos/${slug}/invitations`]);
  const collaborators = env.gh(['api', `repos/${slug}/collaborators`]);
  if (invitations === null && collaborators === null) {
    return [`${check.label}(GitHub CLI にログインしていないため、招待を確かめられません)`];
  }
  const invited = JSON.parse(invitations ?? '[]').some((i) => i.invitee?.login === check.github);
  const joined = JSON.parse(collaborators ?? '[]').some((c) => c.login === check.github);
  return invited || joined ? [] : [check.label];
}

function runCheck(repoDir, check, env) {
  switch (check.type) {
    case 'file': {
      const text = readDoc(repoDir, check.path);
      return text !== null && countChars(text) >= check.minChars ? [] : [check.label];
    }
    case 'headings':
      return checkHeadings(repoDir, check);
    case 'timed_items':
      return checkTimedItems(repoDir, check);
    case 'pushed':
      return checkPushed(env, check);
    case 'invited':
      return checkInvited(env, check);
    case 'any_file':
      return listFiles(repoDir, check.dir).length > 0 ? [] : [check.label];
    case 'savings': {
      const text = readDoc(repoDir, check.path);
      return text !== null && parseSavings(text) ? [] : [check.label];
    }
    case 'url':
      return checkUrl(repoDir, check, env);
    default:
      throw new Error(`unknown check type: ${check.type}`);
  }
}

const REVIEW_AFTER_DAYS = 14;
const REVIEW_AFTER_COMMITS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

// CLAUDE.md を前回触ってからの日数と、受講者自身の作業の commit 数から、見直しの時期かを決める。
export function claudeMdStatus(repoDir, env, now = new Date()) {
  const text = readRepoFile(repoDir, 'CLAUDE.md');
  if (text === null || text.includes(TEMPLATE_MARK)) return { due: false };
  const last = env.git(['log', '-1', '--format=%H %cI', '--', 'CLAUDE.md'])?.trim();
  if (!last) return { due: false };
  const [sha, date] = last.split(' ');
  const count = env.git(['rev-list', '--count', `${sha}..HEAD`, '--', '.', ':!course', ':!scripts', ':!.claude']);
  const commitsSince = Number(count) || 0;
  const daysSince = Math.floor((now - new Date(date)) / DAY_MS);
  const due = (daysSince >= REVIEW_AFTER_DAYS && commitsSince >= 1) || commitsSince >= REVIEW_AFTER_COMMITS;
  return { due, daysSince, commitsSince, lastUpdated: date };
}

export function reminderText(status) {
  if (!status.due) return '';
  return `CLAUDE.md を前回見直してから ${status.daysSince} 日、作業の保存が ${status.commitsSince} 回たまっています。受講者に最初の返答で、作業内容をもとに CLAUDE.md を見直せることを1文で伝え、/review-claude-md を案内してください。`;
}

export function updateReminderText(output) {
  if (!output?.includes('更新があります')) return '';
  return 'コースの教材に更新があります。受講者に最初の返答で1文で伝え、/next で内容を確かめて取り込めることを案内してください。';
}

export function evaluate(repoDir, rules, env) {
  const stages = rules.map((rule) => {
    const missing = rule.checks.flatMap((check) => runCheck(repoDir, check, env));
    return { id: rule.id, title: rule.title, done: missing.length === 0, missing };
  });
  const current = stages.find((s) => !s.done);
  const lastCommitDate = env.git(['log', '-1', '--format=%cI'])?.trim() || null;
  return { stages, currentStage: current ? current.id : null, lastCommitDate, claudeMd: claudeMdStatus(repoDir, env) };
}

function run(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

export function createEnv(repoDir, options = {}) {
  return {
    git: (args) => run('git', args, repoDir),
    gh: (args) => run('gh', args, repoDir),
    ...options,
  };
}

export function loadRules() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  return JSON.parse(readFileSync(join(root, 'course', 'rules.json'), 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoDir = dirname(dirname(fileURLToPath(import.meta.url)));
  const http = (url) => run('curl', ['-sIL', '--max-time', '8', url], repoDir);
  const env = createEnv(repoDir, { assumeInvited: process.argv.includes('--assume-invited'), http });
  const result = evaluate(repoDir, loadRules(), env);
  process.stdout.write(`${JSON.stringify({ ...result, roadmap: renderRoadmap(result, loadRoadmap()) }, null, 2)}\n`);
}
