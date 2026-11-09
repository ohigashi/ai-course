// これまでの歩み(節目の日付)を残し、読める形にする。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCliEnv, evaluate, listFiles, loadRules, parseSavings, readRepoFile } from './check.mjs';
import { levelProgress, loadCatalog, parseCompleted } from './challenge.mjs';
import { isRealDate, parseActivity, PHASES, todayString } from './activity.mjs';
import { loadRoadmap } from './roadmap.mjs';

const MILESTONES_FILE = 'milestones.json';
const HIDDEN_FROM_TEAM = 'phase:継続される';

const MAX_EVENTS = 200;
const isValidKey = (key) => typeof key === 'string'
  && (/^(stage|level):\d{1,3}$/.test(key) || (key.startsWith('phase:') && PHASES.includes(key.slice('phase:'.length))));

// 他の人にも見える一覧に載るので、決まった形の節目だけを受け付ける。
export function parseMilestones(text) {
  if (text === null) return [];
  try {
    const events = JSON.parse(text)?.events;
    return Array.isArray(events) ? events.filter((e) => isValidKey(e?.key) && isRealDate(e?.date)).slice(-MAX_EVENTS) : [];
  } catch {
    return [];
  }
}

export function syncMilestones(events, state, today) {
  // 「継続される」はチームに見せないので、同じ日に実装の節目も残して推測できないようにする。
  const phases = state.phase === '継続される' ? ['仕組みとして実装する', state.phase] : [state.phase];
  const keys = [...state.stagesDone.map((id) => `stage:${id}`), ...phases.map((p) => `phase:${p}`), ...state.levels.map((n) => `level:${n}`)];
  const known = new Set(events.map((e) => e.key));
  return [...events, ...keys.filter((key) => !known.has(key)).map((key) => ({ key, date: today }))];
}

const isCount = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function parseSnapshots(text) {
  if (text === null) return [];
  try {
    const list = JSON.parse(text)?.snapshots;
    return Array.isArray(list) ? list.filter((s) => /^\d{4}-\d{2}$/.test(s?.month ?? '') && isCount(s.made) && isCount(s.savedHours)).slice(-MAX_EVENTS) : [];
  } catch {
    return [];
  }
}

export const syncSnapshots = (snapshots, month, made, savedHours) => [...snapshots.filter((s) => s.month !== month), { month, made, savedHours }];

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
  const result = evaluate(repoDir, loadRules(), createCliEnv(repoDir, { assumeInvited: true }));
  const levels = levelProgress(parseCompleted(read('challenges.json')), loadCatalog()).completedLevels;
  const stagesDone = result.stages.filter((s) => s.done && s.id !== 7).map((s) => s.id);
  const current = read(MILESTONES_FILE);
  const events = syncMilestones(parseMilestones(current), { stagesDone, phase: result.phase, levels }, todayString());
  const log = readRepoFile(repoDir, 'docs/02-log.md');
  const made = listFiles(repoDir, 'work').length + listFiles(repoDir, 'app').length;
  const snapshots = syncSnapshots(parseSnapshots(current), todayString().slice(0, 7), made, log === null ? 0 : parseSavings(log)?.monthlySavedHours ?? 0);
  writeFileSync(MILESTONES_FILE, `${JSON.stringify({ events, snapshots }, null, 2)}\n`);
  console.log(renderTimeline(events, loadRoadmap()));
  const months = monthlyActivity(parseActivity(read('activity.json')));
  if (months.length) console.log(`\n月ごとの活用日数\n${months.map((m) => `${m.month}: ${m.days}日`).join('\n')}`);
  console.log(`\n作ったものと減らした時間の変化\n${snapshots.map((s) => `${s.month}: 作ったもの ${s.made}件、減らした時間 月 ${s.savedHours}時間`).join('\n')}`);
}
