// 本人が申告する出来事(仕事をAIに任せた、作ったものが今月も動いている)と、目標の見直しを聞いた記録。日付だけを .local/events.json に残す(GitHub には上がらない)。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRealDate, todayString } from './activity.mjs';
import { ensureLocalExcluded, localDirIsTracked, LOCAL_DIR } from './local-dir.mjs';

const LOG_FILE = join(LOCAL_DIR, 'events.json');
export const EVENT_KINDS = ['delegated', 'running', 'asked', 'review'];

// 月に1回だけ残すまとまり。「作ったものはまだ使っていますか」と「目標を見直しますか」は互いに打ち消さない。
const MONTHLY_GROUPS = [['running', 'asked'], ['review']];
const groupOf = (kind) => MONTHLY_GROUPS.find((g) => g.includes(kind));
const askedThisMonth = (log, group, month) => log.some((e) => group.includes(e.kind) && e.date.startsWith(month));

export function parseEvents(text) {
  let data;
  try { data = JSON.parse(text ?? 'null'); } catch { return []; }
  if (!Array.isArray(data)) return [];
  return data.filter((e) => e && EVENT_KINDS.includes(e.kind) && isRealDate(e.date)).map((e) => ({ kind: e.kind, date: e.date }));
}

// running と asked(聞いたが使っていなかった)、review(見直しを聞いた)は月に1回、delegated は日に1回だけ残す。
export function addEvent(log, kind, today) {
  if (!EVENT_KINDS.includes(kind)) throw new Error(`知らない種類です: ${kind}`);
  const group = groupOf(kind);
  if (group && askedThisMonth(log, group, today.slice(0, 7))) return log;
  if (!group && log.some((e) => e.kind === kind && e.date === today)) return log;
  return [...log, { kind, date: today }];
}

export const runningAskDue = (log, month) => !askedThisMonth(log, groupOf('running'), month);
export const reviewDue = (log, month) => !askedThisMonth(log, groupOf('review'), month);

const readLog = () => parseEvents(existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf8') : null);

function main(args) {
  const [cmd, kind] = args;
  if (cmd === 'due') {
    const due = kind === 'review' ? reviewDue : runningAskDue;
    console.log(due(readLog(), todayString().slice(0, 7)) ? 'はい' : 'いいえ');
    return 0;
  }
  if (cmd === 'add' && EVENT_KINDS.includes(kind)) {
    if (localDirIsTracked()) {
      console.log(`${LOCAL_DIR}/ の内容が GitHub の管理に入っています。記録を止めて、大東に相談してください。`);
      return 1;
    }
    ensureLocalExcluded();
    mkdirSync(LOCAL_DIR, { recursive: true });
    writeFileSync(LOG_FILE, `${JSON.stringify(addEvent(readLog(), kind, todayString()), null, 2)}\n`);
    console.log(`出来事を記録しました。この記録はこのパソコンの ${LOCAL_DIR}/ にだけ残り、誰にも見えません。別のパソコンには引き継がれません。`);
    return 0;
  }
  console.log('使い方: node scripts/events.mjs add delegated|running|asked|review | due [review]');
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
