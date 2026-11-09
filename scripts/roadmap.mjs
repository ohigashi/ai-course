// コース全体の地図と、いまどこにいるかを4つのフェーズで文字にする。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { roundCount } from './works.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export const loadRoadmap = () => JSON.parse(readFileSync(join(root, 'course', 'roadmap.json'), 'utf8'));

const ITEM = '    ';
const SUB = '      ';
const CHALLENGE_NEXT = '/challenge で次の課題に取り組む';

const firstMissingOfSetup = (result) => result.stages.find((s) => s.id === 0)?.missing[0] ?? '/next で次の一歩を確かめる';

function phaseLines(result, phase, extras) {
  const mine = result.works.filter((work) => work.phase === phase.id);
  const total = result.works.reduce((sum, work) => sum + roundCount(work, phase.id), 0)
    + (phase.id === 3 ? extras.stepups : 0) + (phase.id === 4 ? extras.levelsDone : 0);
  const lines = [`${phase.id} ${phase.title}(これまで ${total}回)`];
  for (const work of mine) {
    if (work.state === 'paused') {
      lines.push(`${ITEM}${work.name}(休み中)`);
      continue;
    }
    const done = roundCount(work, phase.id);
    lines.push(`${ITEM}${work.name}${done >= 1 ? `(${done + 1}回目)` : ''}`, `${SUB}次にやること: ${work.nextAction}`, `${SUB}作りながら分かること: ${phase.learn}`);
  }
  if (phase.id === 4 && extras.challengeStarted) lines.push(`${ITEM}課題解決`, `${SUB}次にやること: ${CHALLENGE_NEXT}`);
  if (phase.id === 4 && extras.teamStarted) lines.push(`${ITEM}チームで作る`);
  return lines;
}

export function renderRoadmap(result, phases, extras) {
  const map = phases.flatMap((phase) => phaseLines(result, phase, extras));
  if (result.setupDone) return map.join('\n');
  return [`はじめに: 環境づくりとデータの決まりを終えます。次: ${firstMissingOfSetup(result)}`, ...map].join('\n');
}

export function statusLine(result, phases) {
  if (!result.setupDone) return `はじめに | 次: ${firstMissingOfSetup(result)}`;
  const active = result.works.filter((work) => work.state === 'active');
  if (active.length === 0) return '進めていること 0件';
  const last = active.reduce((best, work) => (work.touchedAt >= best.touchedAt ? work : best));
  return `進めていること ${active.length}件 | ${last.name}: ${phases.find((p) => p.id === last.phase)?.title ?? ''}`;
}
