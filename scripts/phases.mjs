// コースを4つのフェーズで見せるための定義と、判定結果からの状態の導出。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const CHALLENGE_STAGE = 7;
const LAST_PHASE_ID = 4;
const LAST_PHASE_REQUIRES = [0, 1, 2];

export const loadPhases = () => JSON.parse(readFileSync(join(root, 'course', 'phases.json'), 'utf8'));

// 段階がない(基本を終えた)ときは、段階を持たないフェーズを返す。
export function phaseOfStage(stageId, phases) {
  if (stageId === null || stageId === undefined) return phases.find((p) => p.stages.length === 0);
  return phases.find((p) => p.stages.includes(stageId));
}

export function phaseMarks(result, phases) {
  const doneIds = new Set(result.stages.filter((s) => s.done).map((s) => s.id));
  const current = phaseOfStage(result.currentStage, phases);
  return phases.map((p) => {
    const finished = p.stages.length > 0 && p.stages.every((id) => doneIds.has(id));
    const open = p.id === LAST_PHASE_ID && LAST_PHASE_REQUIRES.every((id) => doneIds.has(id));
    let note = '';
    if (p.id === LAST_PHASE_ID) note = open ? '参加できます' : '小さな自動化と課題の選定のあとに参加できます';
    let mark = '-';
    if (finished) mark = '済';
    else if (current && p.id === current.id) mark = '今';
    else if (open) mark = '可';
    if (mark === '済') note = '';
    return { id: p.id, title: p.title, learn: p.learn, mark, note };
  });
}

export function nextActionOf(result) {
  if (result.currentStage === null) {
    const challenge = result.stages.find((s) => s.id === CHALLENGE_STAGE);
    if (challenge && !challenge.done) return '/challenge で次の課題に取り組む';
    return 'フェーズ1と2を終えました。繰り返して慣れるか、人の課題の解決に進みます';
  }
  const stage = result.stages.find((s) => s.id === result.currentStage);
  return stage?.missing[0] ?? '/next で次の一歩を確かめる';
}
