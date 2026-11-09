// 課題解決コースのレベルの判定と、完了の記録。評価の中身はここに持たない。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const REQUIRED_PER_LEVEL = 2;
const RECORD_FILE = 'challenges.json';

export const loadCatalog = () => JSON.parse(readFileSync(join(root, 'course', 'challenges', 'catalog.json'), 'utf8'));

export function parseCompleted(text) {
  if (text === null) return [];
  try {
    const list = JSON.parse(text)?.completed;
    return Array.isArray(list) ? list.filter((c) => typeof c?.id === 'string') : [];
  } catch {
    return [];
  }
}

export function levelProgress(completed, catalog) {
  const done = new Set(completed.map((c) => c.id));
  const levels = [...new Set(catalog.map((c) => c.level))].sort((a, b) => a - b);
  const completedLevels = [];
  for (const level of levels) {
    if (catalog.filter((c) => c.level === level && done.has(c.id)).length < REQUIRED_PER_LEVEL) return { current: level, completedLevels };
    completedLevels.push(level);
  }
  return { current: null, completedLevels };
}

export function canStart(id, completed, catalog) {
  const item = catalog.find((c) => c.id === id);
  if (!item) return false;
  const { current } = levelProgress(completed, catalog);
  return current === null || item.level <= current;
}

export function recordCompletion(completed, id, date, catalog) {
  if (!catalog.some((c) => c.id === id)) throw new Error(`unknown challenge: ${id}`);
  return completed.some((c) => c.id === id) ? completed : [...completed, { id, date }];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, id] = process.argv.slice(2);
  const catalog = loadCatalog();
  const completed = parseCompleted(existsSync(RECORD_FILE) ? readFileSync(RECORD_FILE, 'utf8') : null);
  if (command === 'complete') {
    if (!canStart(id, completed, catalog)) {
      console.log('この課題はまだ記録できません。いまのレベルの課題か、課題の名前を確かめてください。');
      process.exit(1);
    }
    const today = new Date().toLocaleDateString('sv');
    writeFileSync(RECORD_FILE, `${JSON.stringify({ completed: recordCompletion(completed, id, today, catalog) }, null, 2)}\n`);
    console.log('課題の完了を記録しました。評価の中身は記録していません。');
  } else {
    const progress = levelProgress(completed, catalog);
    const done = new Set(completed.map((c) => c.id));
    const available = catalog.filter((c) => c.level === progress.current && !done.has(c.id));
    console.log(JSON.stringify({ ...progress, completed: completed.map((c) => c.id), available }, null, 2));
  }
}
