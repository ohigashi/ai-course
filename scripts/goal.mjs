// 自己評価。項目ごとに本人が付けた 1〜10 を .local/ratings.json に残す(GitHub には上がらない)。
// 比べる相手は前回の自分だけ。合計や平均は出さず、進む条件にも使わない。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRealDate, todayString } from './activity.mjs';
import { ensureLocalExcluded, localDirIsTracked, LOCAL_DIR } from './local-dir.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const LOG_FILE = join(LOCAL_DIR, 'ratings.json');

export const loadAbilities = () => JSON.parse(readFileSync(join(root, 'course', 'abilities.json'), 'utf8'));

const isScore = (n) => Number.isInteger(n) && n >= 1 && n <= 10;

function validValues(values, ids) {
  if (!values || typeof values !== 'object') return {};
  return Object.fromEntries(Object.entries(values).filter(([id, n]) => ids.includes(id) && isScore(n)));
}

export function parseRatings(text, abilities = loadAbilities()) {
  let data;
  try { data = JSON.parse(text ?? 'null'); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const ids = abilities.items.map((i) => i.id);
  return data
    .filter((e) => e && isRealDate(e.date))
    .map((e) => ({ date: e.date, values: validValues(e.values, ids) }))
    .filter((e) => Object.keys(e.values).length > 0);
}

// 同じ日に付け直したら、その日の記録を後の値で置き換える。
export function addRating(log, values, today, abilities = loadAbilities()) {
  const ids = abilities.items.map((i) => i.id);
  const entries = Object.entries(values ?? {});
  if (entries.length === 0) throw new Error('自己評価が1つもありません。項目=値 の形で1つ以上入力してください。');
  const bad = entries.filter(([id, n]) => !ids.includes(id) || !isScore(n)).map(([id, n]) => `${id}=${n}`);
  if (bad.length) throw new Error(`記録できない値があります: ${bad.join(' ')}。項目は ${ids.join(' ')}、値は 1 から 10 の整数です。`);
  return [...log.filter((e) => e.date !== today), { date: today, values: Object.fromEntries(entries) }].sort((a, b) => a.date.localeCompare(b.date));
}

export function renderRatings(log, abilities = loadAbilities()) {
  const scale = Object.entries(abilities.scale).map(([n, text]) => `${n} ${text}`).join('、');
  if (log.length === 0) return `自己評価はまだありません。項目ごとに 1 から 10 で付けます。目安: ${scale}\n${abilities.items.map((i) => `- ${i.label}`).join('\n')}`;
  const sorted = [...log].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  const lines = abilities.items.map((item) => {
    const now = latest.values[item.id];
    const before = sorted.slice(0, -1).reverse().find((e) => item.id in e.values)?.values[item.id];
    return `- ${item.label} ${now ?? '-'}(前回 ${before ?? 'なし'})`;
  });
  return `自己評価(${latest.date})。目安: ${scale}\n${lines.join('\n')}`;
}

const readLog = () => parseRatings(existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf8') : null);

function main(args) {
  const [cmd, ...rest] = args;
  if (cmd === 'show') {
    console.log(renderRatings(readLog()));
    return 0;
  }
  if (cmd === 'rate') {
    const values = Object.fromEntries(rest.map((pair) => {
      const [id, n] = pair.split('=');
      return [id, /^\d+$/.test(n ?? '') ? Number(n) : n];
    }));
    let next;
    try { next = addRating(readLog(), values, todayString()); } catch (e) { console.log(e.message); return 1; }
    if (localDirIsTracked()) {
      console.log(`${LOCAL_DIR}/ の内容が GitHub の管理に入っています。記録を止めて、大東に相談してください。`);
      return 1;
    }
    ensureLocalExcluded();
    mkdirSync(LOCAL_DIR, { recursive: true });
    writeFileSync(LOG_FILE, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`自己評価を記録しました。この記録はこのパソコンの ${LOCAL_DIR}/ にだけ残り、誰にも見えません。別のパソコンには引き継がれません。`);
    return 0;
  }
  console.log('使い方: node scripts/goal.mjs show | rate <項目>=<1〜10> ...');
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
