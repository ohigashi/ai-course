// コースを4つのフェーズで見せるための定義と、判定結果からの状態の導出。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const CHALLENGE_STAGE = 7;

export const loadPhases = () => JSON.parse(readFileSync(join(root, 'course', 'phases.json'), 'utf8'));

// 段階がない(基本を終えた)ときは、段階を持たないフェーズを返す。
export function phaseOfStage(stageId, phases) {
  if (stageId === null || stageId === undefined) return phases.find((p) => p.stages.length === 0);
  return phases.find((p) => p.stages.includes(stageId));
}

// 最後に作業した active な取り組みを選ぶ(同じ日なら配列の後ろ)。touchedAt が無い結果(運営側)は最初の active。
function leadingWork(works) {
  const active = (works ?? []).filter((w) => w.state === 'active');
  let best = active[0];
  for (const w of active.slice(1)) if (w.touchedAt && (!best.touchedAt || w.touchedAt >= best.touchedAt)) best = w;
  return best;
}

export function nextActionOf(result) {
  const work = leadingWork(result.works);
  const own = work?.nextAction ?? work?.next;
  if (own) return own;
  if (result.currentStage === null) {
    const challenge = result.stages.find((s) => s.id === CHALLENGE_STAGE);
    if (challenge && !challenge.done) return '/challenge で次の課題に取り組む';
    return 'フェーズ1と2を終えました。繰り返して慣れるか、人の課題の解決に進みます';
  }
  const stage = result.stages.find((s) => s.id === result.currentStage);
  return stage?.missing[0] ?? '/next で次の一歩を確かめる';
}
