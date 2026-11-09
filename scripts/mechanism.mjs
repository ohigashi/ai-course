// 仕組みを自分の言葉で確かめるお題。完了の日付だけを .local/mechanisms.json に残す(GitHub には上がらない)。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRealDate, todayString } from './activity.mjs';
import { ensureLocalExcluded, localDirIsTracked, LOCAL_DIR } from './local-dir.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const LOG_FILE = join(LOCAL_DIR, 'mechanisms.json');

export const loadMechanisms = () => JSON.parse(readFileSync(join(root, 'course', 'mechanisms.json'), 'utf8'));

export function parseMechanismLog(text) {
  let data;
  try { data = JSON.parse(text ?? 'null'); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const seen = new Set();
  const out = [];
  for (const e of data) {
    if (!e || typeof e.id !== 'string' || !isRealDate(e.date) || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push({ id: e.id, date: e.date });
  }
  return out;
}

export function markMechanismDone(log, id, today, catalog) {
  if (!catalog.some((m) => m.id === id)) throw new Error(`知らないお題です: ${id}`);
  if (log.some((e) => e.id === id)) return log;
  return [...log, { id, date: today }];
}

function main(args) {
  const catalog = loadMechanisms();
  const [cmd, id] = args;
  if (cmd === 'list') {
    const done = new Map(parseMechanismLog(existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf8') : null).map((e) => [e.id, e.date]));
    for (const m of catalog) console.log(`フェーズ${m.phase} ${m.id} ${m.title}${done.has(m.id) ? ` (済 ${done.get(m.id)})` : ''}\n  ${m.prompt}`);
    return 0;
  }
  if (cmd === 'done' && id) {
    if (!catalog.some((m) => m.id === id)) { console.log(`知らないお題です: ${id}。node scripts/mechanism.mjs list で確かめてください。`); return 1; }
    if (localDirIsTracked()) {
      console.log(`${LOCAL_DIR}/ の内容が GitHub の管理に入っています。記録を止めて、大東に相談してください。`);
      return 1;
    }
    ensureLocalExcluded();
    mkdirSync(LOCAL_DIR, { recursive: true });
    const log = parseMechanismLog(existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf8') : null);
    writeFileSync(LOG_FILE, `${JSON.stringify(markMechanismDone(log, id, todayString(), catalog), null, 2)}\n`);
    console.log(`お題 ${id} を記録しました。回答と日付は ${LOCAL_DIR}/ に残り、誰にも見えません。`);
    return 0;
  }
  console.log('使い方: node scripts/mechanism.mjs list | done <id>');
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
