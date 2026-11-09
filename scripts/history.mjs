// これまでの歩み(節目の日付)を残し、読める形にする。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createEnv, evaluate, loadRules } from './check.mjs';
import { levelProgress, loadCatalog, parseCompleted } from './challenge.mjs';
import { parseActivity, todayString } from './activity.mjs';
import { loadRoadmap } from './roadmap.mjs';

const MILESTONES_FILE = 'milestones.json';
const HIDDEN_FROM_TEAM = 'phase:継続される';

export function parseMilestones(text) {
  if (text === null) return [];
  try {
    const events = JSON.parse(text)?.events;
    return Array.isArray(events) ? events.filter((e) => typeof e?.key === 'string' && typeof e?.date === 'string') : [];
  } catch {
    return [];
  }
}

export function syncMilestones(events, state, today) {
  const keys = [...state.stagesDone.map((id) => `stage:${id}`), `phase:${state.phase}`, ...state.levels.map((n) => `level:${n}`)];
  const known = new Set(events.map((e) => e.key));
  return [...events, ...keys.filter((key) => !known.has(key)).map((key) => ({ key, date: today }))];
}

function label(key, roadmap) {
  const [type, value] = key.split(':');
  if (type === 'stage') return `段階${value} ${roadmap.find((s) => String(s.id) === value)?.title ?? ''} を終えた`.replace('  ', ' ');
  if (type === 'level') return `課題解決 レベル${value} を終えた`;
  return `位置が「${value}」に進んだ`;
}

export function renderTimeline(events, roadmap) {
  return [...events].sort((a, b) => a.date.localeCompare(b.date)).map((e) => `${e.date} ${label(e.key, roadmap)}`).join('\n');
}

export const teamMilestones = (events) => events.filter((e) => e.key !== HIDDEN_FROM_TEAM);

export function monthlyActivity(days) {
  const counts = new Map();
  for (const day of [...days].sort()) counts.set(day.slice(0, 7), (counts.get(day.slice(0, 7)) ?? 0) + 1);
  return [...counts].map(([month, n]) => ({ month, days: n }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoDir = dirname(dirname(fileURLToPath(import.meta.url)));
  const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null);
  const result = evaluate(repoDir, loadRules(), createEnv(repoDir, { assumeInvited: true }));
  const levels = levelProgress(parseCompleted(read('challenges.json')), loadCatalog()).completedLevels;
  const stagesDone = result.stages.filter((s) => s.done && s.id !== 7).map((s) => s.id);
  const events = syncMilestones(parseMilestones(read(MILESTONES_FILE)), { stagesDone, phase: result.phase, levels }, todayString());
  writeFileSync(MILESTONES_FILE, `${JSON.stringify({ events }, null, 2)}\n`);
  console.log(renderTimeline(events, loadRoadmap()));
  const months = monthlyActivity(parseActivity(read('activity.json')));
  if (months.length) console.log(`\n月ごとの活用日数\n${months.map((m) => `${m.month}: ${m.days}日`).join('\n')}`);
}
