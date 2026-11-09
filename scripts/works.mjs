// 取り組み(works.json)。受講者の進捗の単位で、複数を並行して持てる。
import { isRealDate } from './activity.mjs';

export const WORKS_FILE = 'works.json';
const MAX_WORKS = 20;
const TEXT_LIMIT = 120;
const PHASES = [1, 2, 3, 4];
// 回数を数えるフェーズと、それを判定する段階
const ROUND_STAGES = { 1: [2], 2: [1, 3, 4, 5] };

const text = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, TEXT_LIMIT) : '');
const validSlug = (s) => s === 'main' || (typeof s === 'string' && /^w\d{1,3}$/.test(s));
const validRound = (r) => r && PHASES.includes(r.phase) && isRealDate(r.date);

function cleanWork(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return null;
  if (!validSlug(w.slug) || !PHASES.includes(w.phase)) return null;
  if (w.state !== 'active' && w.state !== 'paused') return null;
  if (!isRealDate(w.startedAt) || !isRealDate(w.touchedAt)) return null;
  const rounds = (Array.isArray(w.rounds) ? w.rounds : []).filter(validRound).map((r) => ({ phase: r.phase, date: r.date }));
  return { slug: w.slug, name: text(w.name), phase: w.phase, state: w.state, next: text(w.next), rounds, startedAt: w.startedAt, touchedAt: w.touchedAt };
}

// ファイルなしは []。JSON として壊れているときだけ null。
export function parseWorks(raw) {
  if (raw === null) return [];
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const items = Array.isArray(data?.items) ? data.items : [];
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const w = cleanWork(item);
    if (!w || seen.has(w.slug)) continue;
    seen.add(w.slug);
    out.push(w);
    if (out.length >= MAX_WORKS) break;
  }
  return out;
}

const stageDone = (result, id) => result.stages.find((s) => s.id === id)?.done === true;
const phaseDone = (result, phase) => ROUND_STAGES[phase].every((id) => stageDone(result, id));

// works.json が無い既存の受講者向けに、main の取り組みを1つ作る。
export function defaultWorks(result, today) {
  const phase = !phaseDone(result, 1) ? 1 : !phaseDone(result, 2) ? 2 : 3;
  const rounds = [1, 2].filter((p) => phaseDone(result, p)).map((p) => ({ phase: p, date: today }));
  return [{ slug: 'main', name: '最初の取り組み', phase, state: 'active', next: '', rounds, startedAt: today, touchedAt: today }];
}

export const workPath = (slug, path) => (slug === 'main' ? path : `works/${slug}/${path}`);

// 判定が通ったフェーズのうち、まだ回数に入っていないものだけ足す。
export function syncRounds(works, evaluated, today) {
  return works.map((w) => {
    const checks = evaluated.find((e) => e.slug === w.slug)?.checks;
    if (!checks) return w;
    const added = [1, 2].filter((p) => checks[p]?.done && !w.rounds.some((r) => r.phase === p));
    return added.length ? { ...w, rounds: [...w.rounds, ...added.map((phase) => ({ phase, date: today }))] } : w;
  });
}

export const roundCount = (work, phaseId) => work.rounds.filter((r) => r.phase === phaseId).length;
