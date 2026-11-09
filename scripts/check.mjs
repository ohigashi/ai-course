// コースの完了条件を判定する。AI を使わず、リポジトリの中身だけで決める。
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEMPLATE_MARK = '<!-- template -->';
const COURSE_PATHS = ['course/', 'scripts/', '.claude/'];

function readDoc(repoDir, path) {
  const full = join(repoDir, path);
  if (!existsSync(full)) return null;
  const text = readFileSync(full, 'utf8').replace(/\r\n?/g, '\n');
  return text.includes(TEMPLATE_MARK) ? null : text;
}

const countChars = (text) => text.replace(/<!--[\s\S]*?-->/g, '').replace(/\s/g, '').length;

function sections(text) {
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
    .filter((h) => countChars(found.get(h) ?? '') < check.minChars)
    .map((h) => `${check.label}(「${h}」の内容)`);
}

function checkTimedItems(repoDir, check) {
  const text = readDoc(repoDir, check.path);
  if (text === null) return [check.label];
  const count = text
    .split('\n')
    .filter((line) => /^\s*[-*]\s+/.test(line) && /\d+\s*(分|時間)/.test(toHalfWidthDigits(line))).length;
  return count >= check.min ? [] : [`${check.label}(いま ${count} 件)`];
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
    default:
      throw new Error(`unknown check type: ${check.type}`);
  }
}

export function evaluate(repoDir, rules, env) {
  const stages = rules.map((rule) => {
    const missing = rule.checks.flatMap((check) => runCheck(repoDir, check, env));
    return { id: rule.id, title: rule.title, done: missing.length === 0, missing };
  });
  const current = stages.find((s) => !s.done);
  const lastCommitDate = env.git(['log', '-1', '--format=%cI'])?.trim() || null;
  return { stages, currentStage: current ? current.id : null, lastCommitDate };
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
  const env = createEnv(repoDir, { assumeInvited: process.argv.includes('--assume-invited') });
  process.stdout.write(`${JSON.stringify(evaluate(repoDir, loadRules(), env), null, 2)}\n`);
}
