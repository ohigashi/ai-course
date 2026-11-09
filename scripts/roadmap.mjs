// コース全体の地図と、いまどこにいるかを文字にする。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export const loadRoadmap = () => JSON.parse(readFileSync(join(root, 'course', 'roadmap.json'), 'utf8'));

const required = (roadmap) => roadmap.filter((s) => !s.optional);

function position(result, roadmap) {
  const prepared = new Set(result.stages.map((s) => s.id));
  const id = result.currentStage ?? required(roadmap).find((s) => !prepared.has(s.id))?.id ?? null;
  return { id, prepared };
}

function optionalLine(stage, result, text) {
  if (result.stages.find((s) => s.id === stage.id)?.done) return `済 ${text}`;
  const open = result.stages.filter((s) => s.id <= stage.availableAfter).every((s) => s.done)
    && result.stages.some((s) => s.id === stage.availableAfter);
  return open ? `可 ${text}(参加できます)` : `- ${text}(段階${stage.availableAfter}のあとに参加できます)`;
}

export function renderRoadmap(result, roadmap) {
  const { id, prepared } = position(result, roadmap);
  return roadmap.map((stage) => {
    const done = result.stages.find((s) => s.id === stage.id)?.done;
    const text = `段階${stage.id} ${stage.title}: ${stage.goal}`;
    if (stage.optional) return optionalLine(stage, result, text);
    if (stage.id === id) return `今 ${text}(いまここ${prepared.has(stage.id) ? '' : '・準備中'})`;
    return `${done ? '済' : '-'} ${text}`;
  }).join('\n');
}

export function statusLine(result, roadmap) {
  const { id, prepared } = position(result, roadmap);
  const stages = required(roadmap);
  const index = stages.findIndex((s) => s.id === id);
  if (index < 0) return `コース ${stages.length}/${stages.length} すべて完了`;
  const head = `コース ${index + 1}/${stages.length} ${stages[index].title}`;
  if (!prepared.has(id)) return `${head}(準備中)`;
  const next = result.stages.find((s) => s.id === id).missing[0];
  return next ? `${head} | 次: ${next}` : head;
}
