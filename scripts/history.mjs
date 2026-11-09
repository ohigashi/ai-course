// これまでの歩み(節目の日付)を残し、読める形にする。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCliEnv, evaluate, listFiles, loadRules, parseSavings, readRepoFile } from './check.mjs';
import { levelProgress, loadCatalog, parseCompleted } from './challenge.mjs';
import { isRealDate, parseActivity, LEGACY_PHASES, todayString } from './activity.mjs';
import { loadRoadmap } from './roadmap.mjs';
import { loadPhases } from './phases.mjs';
import { roundCount, worksOutcome } from './works.mjs';
import { loadMechanisms, parseMechanismLog } from './mechanism.mjs';
import { parseEvents } from './events.mjs';

const MILESTONES_FILE = 'milestones.json';

const MAX_EVENTS = 200;
const isValidKey = (key) => typeof key === 'string'
  && (/^(stage|level|phase-done):\d{1,3}$/.test(key) || (key.startsWith('phase:') && LEGACY_PHASES.includes(key.slice('phase:'.length))));

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

// 旧 phase:* の記録は events にそのまま残る(表示はしない)。mechanism:* はここに書かない。
export function syncMilestones(events, state, today) {
  const keys = [...state.stagesDone.map((id) => `stage:${id}`), ...state.phasesDone.map((id) => `phase-done:${id}`), ...state.levels.map((n) => `level:${n}`)];
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

function label(key, { roadmap, phases, mechanisms }) {
  const [type, value] = key.split(':');
  if (type === 'stage') return `${roadmap.find((s) => String(s.id) === value)?.title ?? ''} を終えた`.trim();
  if (type === 'level') return `課題解決 レベル${value} を終えた`;
  if (type === 'phase-done') return `フェーズ${value} ${phases.find((p) => String(p.id) === value)?.title ?? ''} を終えた`.replace('  ', ' ');
  if (type === 'mechanism') return `仕組みのお題「${mechanisms.find((m) => m.id === value)?.title ?? value}」を解いた`;
  if (type === 'event' && value === 'delegated') return '仕事をAIに任せた';
  if (type === 'event' && value === 'running') return '作ったものが今月も動いている';
  return null;
}

// 旧 phase:* は表示しない。mechanisms は題名を引くための一覧(course/mechanisms.json)。
export function renderTimeline(events, roadmap, { phases = [], mechanisms = [] } = {}) {
  return events.filter((e) => !e.key.startsWith('phase:')).sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, label(e.key, { roadmap, phases, mechanisms })]).filter(([, text]) => text !== null)
    .map(([date, text]) => `${date} ${text}`).join('\n');
}

// 申告の出来事を歩みの表示に合わせる。asked(聞いたが使っていなかった)は月1回の確認を止めるだけの記録で、表示しない。
export const declaredEntries = (events) => events.filter((e) => e.kind !== 'asked').map((e) => ({ key: `event:${e.kind}`, date: e.date }));

export const monthEvents = (events, month) => events.filter((e) => e.date.startsWith(month));

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
  const phases = loadPhases();
  const phasesDone = phases.filter((p) => result.works.some((work) => roundCount(work, p.id) >= 1)).map((p) => p.id);
  const events = syncMilestones(parseMilestones(current), { stagesDone, phasesDone, levels }, todayString());
  const outcome = worksOutcome(repoDir, result.works, { listFiles, readRepoFile, parseSavings });
  const snapshots = syncSnapshots(parseSnapshots(current), todayString().slice(0, 7), outcome.made.length, outcome.monthlySavedHours);
  writeFileSync(MILESTONES_FILE, `${JSON.stringify({ events, snapshots }, null, 2)}\n`);
  // 仕組みのお題と申告の出来事は手元の記録から表示のときだけ合わせる(milestones.json には書かない)
  const mechanisms = loadMechanisms();
  const shown = [...events, ...parseMechanismLog(read('.local/mechanisms.json')).map((m) => ({ key: `mechanism:${m.id}`, date: m.date })),
    ...declaredEntries(parseEvents(read('.local/events.json')))];
  const labels = { phases, mechanisms };
  const thisMonth = monthEvents(shown, todayString().slice(0, 7));
  if (thisMonth.length) console.log(`今月できたこと\n${renderTimeline(thisMonth, loadRoadmap(), labels)}\n`);
  console.log(renderTimeline(shown, loadRoadmap(), labels));
  const months = monthlyActivity(parseActivity(read('activity.json')));
  if (months.length) console.log(`\n月ごとの活用日数\n${months.map((m) => `${m.month}: ${m.days}日`).join('\n')}`);
  console.log(`\n作ったものと減らした時間の変化\n${snapshots.map((s) => `${s.month}: 作ったもの ${s.made}件、減らした時間 月 ${s.savedHours}時間`).join('\n')}`);
}
