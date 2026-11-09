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

export function nextActionOf(result) {
  if (result.currentStage === null) {
    const challenge = result.stages.find((s) => s.id === CHALLENGE_STAGE);
    if (challenge && !challenge.done) return '/challenge で次の課題に取り組む';
    return 'フェーズ1と2を終えました。繰り返して慣れるか、人の課題の解決に進みます';
  }
  const stage = result.stages.find((s) => s.id === result.currentStage);
  return stage?.missing[0] ?? '/next で次の一歩を確かめる';
}
