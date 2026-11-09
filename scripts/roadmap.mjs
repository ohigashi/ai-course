// コース全体の地図と、いまどこにいるかを4つのフェーズで文字にする。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { phaseMarks, phaseOfStage, nextActionOf } from './phases.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export const loadRoadmap = () => JSON.parse(readFileSync(join(root, 'course', 'roadmap.json'), 'utf8'));

const INDENT = '     ';

export function renderRoadmap(result, phases) {
  return phaseMarks(result, phases).flatMap((p) => {
    const head = `${p.mark} ${p.id} ${p.title}${p.note ? `(${p.note})` : ''}`;
    if (p.mark !== '今') return [head];
    return [head, `${INDENT}次にやること: ${nextActionOf(result)}`, `${INDENT}作りながら分かること: ${p.learn}`];
  }).join('\n');
}

export function statusLine(result, phases) {
  const phase = phaseOfStage(result.currentStage, phases);
  return `フェーズ${phase.id}/${phases.length} ${phase.title} | 次: ${nextActionOf(result)}`;
}
