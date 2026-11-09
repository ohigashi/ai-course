// 受講者の手元の判定と次の一歩を progress.json に保存し、GitHub まで届ける。
// 自動で保存するのは、この判定と、取り込み済みのコースの管理ファイルだけ。受講者の作業には触らない。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LEGACY_PHASES } from './activity.mjs';
import { createCliEnv, evaluate, loadRules } from './check.mjs';
import { loadPhases, nextActionOf } from './phases.mjs';

export const PROGRESS_FILE = 'progress.json';
export const AUTO_SUBJECT = 'コースの状態を保存';
const COURSE_PATHS = ['course', 'scripts', '.claude/skills', '.claude/settings.json'];
const TEXT_LIMIT = 200;
const MISSING_LIMIT = 20;
const MAX_WORKS = 20;
const text = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, TEXT_LIMIT) : '');

export { nextActionOf } from './phases.mjs';

export function buildProgress(result) {
  return {
    currentStage: result.currentStage,
    phase: result.phase,
    nextAction: nextActionOf(result),
    stages: result.stages.map((s) => ({ id: s.id, done: s.done, missing: s.missing })),
    works: (result.works ?? []).map((w) => ({ name: w.name, phase: w.phase, state: w.state, next: w.nextAction, rounds: w.rounds.length })),
  };
}

// 他の人のリポジトリから読むので、決まった形だけを受け付ける。
export function parseProgress(raw, stageIds) {
  if (raw === null) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.stages)) return null;
  if (data.currentStage !== null && !stageIds.includes(data.currentStage)) return null;
  const stages = data.stages
    .filter((s) => s && stageIds.includes(s.id) && typeof s.done === 'boolean' && Array.isArray(s.missing))
    .map((s) => ({ id: s.id, done: s.done, missing: s.missing.map(text).filter(Boolean).slice(0, MISSING_LIMIT) }));
  const works = (Array.isArray(data.works) ? data.works : [])
    .filter((w) => w && typeof w === 'object' && text(w.name) && Number.isInteger(w.phase) && w.phase >= 1 && w.phase <= 4
      && (w.state === 'active' || w.state === 'paused') && Number.isInteger(w.rounds) && w.rounds >= 0)
    .slice(0, MAX_WORKS)
    .map((w) => ({ name: text(w.name), phase: w.phase, state: w.state, next: text(w.next), rounds: w.rounds }));
  return { works, currentStage: data.currentStage, phase: [...LEGACY_PHASES, ...loadPhases().map((p) => p.title)].includes(data.phase) ? data.phase : null, stages };
}

export function applyProgress(result, progress) {
  if (!progress) return result;
  return {
    ...result,
    currentStage: progress.currentStage,
    phase: progress.phase ?? result.phase,
    works: progress.works,
    stages: result.stages.map((s) => {
      const own = progress.stages.find((p) => p.id === s.id);
      return own ? { ...s, done: own.done, missing: own.missing } : s;
    }),
  };
}

export function syncRepo(repoDir, result) {
  const git = (...args) => execFileSync('git', args, {
    cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000, windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  const body = `${JSON.stringify(buildProgress(result), null, 2)}\n`;
  const file = join(repoDir, PROGRESS_FILE);
  if (!existsSync(file) || readFileSync(file, 'utf8') !== body) writeFileSync(file, body);
  // 追跡中のファイルの変更だけを見るので、受講者が新しく作ったスキルは含まれない。
  const course = git('diff', '--name-only', '-z', 'HEAD', '--', ...COURSE_PATHS).split('\0').filter(Boolean);
  const progressChanged = git('status', '--porcelain', '--', PROGRESS_FILE).trim() !== '';
  const paths = [...course, ...(progressChanged ? [PROGRESS_FILE] : [])];
  if (paths.length) {
    git('add', '--', ...paths);
    git('commit', '-q', '-m', AUTO_SUBJECT, '--', ...paths);
  }
  // 本人のコミットが未送信のときは、了承なしに送らない。
  const ahead = git('log', '@{u}..HEAD', '--format=%s').split('\n').filter(Boolean);
  const canPush = ahead.length > 0 && ahead.every((s) => s === AUTO_SUBJECT);
  if (canPush) git('push', '-q');
  return { committed: paths.length > 0, pushed: canPush };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const repoDir = dirname(dirname(fileURLToPath(import.meta.url)));
    const result = evaluate(repoDir, loadRules(), createCliEnv(repoDir, { assumeInvited: true }));
    syncRepo(repoDir, result);
    console.log(`コースの次の一歩: ${nextActionOf(result)}`);
  } catch {
    // 同期は補助なので、作業を止めない。次の機会にもう一度送る
  }
}
