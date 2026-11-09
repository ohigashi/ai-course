// コース全体の地図と、いまどこにいるかを文字にする。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export const loadRoadmap = () => JSON.parse(readFileSync(join(root, 'course', 'roadmap.json'), 'utf8'));

function position(result, roadmap) {
  const prepared = new Set(result.stages.map((s) => s.id));
  const id = result.currentStage ?? roadmap.find((s) => !prepared.has(s.id))?.id ?? null;
  return { id, prepared };
}

export function renderRoadmap(result, roadmap) {
  const { id, prepared } = position(result, roadmap);
  return roadmap.map((stage) => {
    const done = result.stages.find((s) => s.id === stage.id)?.done;
    const text = `段階${stage.id} ${stage.title}: ${stage.goal}`;
    if (stage.id === id) return `今 ${text}(いまここ${prepared.has(stage.id) ? '' : '・準備中'})`;
    return `${done ? '済' : '-'} ${text}`;
  }).join('\n');
}

export function statusLine(result, roadmap) {
  const { id, prepared } = position(result, roadmap);
  const index = roadmap.findIndex((s) => s.id === id);
  if (index < 0) return `コース ${roadmap.length}/${roadmap.length} すべて完了`;
  const head = `コース ${index + 1}/${roadmap.length} ${roadmap[index].title}`;
  if (!prepared.has(id)) return `${head}(準備中)`;
  const next = result.stages.find((s) => s.id === id).missing[0];
  return next ? `${head} | 次: ${next}` : head;
}
