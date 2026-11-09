// 今日 AI を活用したことを記録する。GitHub に上がるのは日付だけで、内容は .local/ に残す。
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseActivity, recordDay, todayString } from './activity.mjs';

const ACTIVITY_FILE = 'activity.json';
const LOCAL_DIR = '.local';

function excludeLocalDir() {
  const path = execFileSync('git', ['rev-parse', '--git-path', 'info/exclude'], { encoding: 'utf8' }).trim();
  const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (!current.split(/\r?\n/).includes(`${LOCAL_DIR}/`)) appendFileSync(path, `\n${LOCAL_DIR}/\n`);
}

mkdirSync(LOCAL_DIR, { recursive: true });
excludeLocalDir();
const days = parseActivity(existsSync(ACTIVITY_FILE) ? readFileSync(ACTIVITY_FILE, 'utf8') : null);
writeFileSync(ACTIVITY_FILE, `${JSON.stringify({ days: recordDay(days, todayString()) }, null, 2)}\n`);
console.log(`今日の活用を記録しました。内容は ${LOCAL_DIR}/log.md に、日付だけが ${ACTIVITY_FILE} に残ります。`);
