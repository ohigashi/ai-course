// 今日 AI を活用したことを記録する。GitHub に上がるのは日付だけで、内容は .local/ に残す。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseActivity, recordDay, todayString } from './activity.mjs';
import { ensureLocalExcluded, localDirIsTracked, LOCAL_DIR } from './local-dir.mjs';

const ACTIVITY_FILE = 'activity.json';

if (localDirIsTracked()) {
  console.log(`${LOCAL_DIR}/ の内容が GitHub の管理に入っています。記録を止めて、大東に相談してください。`);
  process.exit(1);
}
ensureLocalExcluded();
mkdirSync(LOCAL_DIR, { recursive: true });
const days = parseActivity(existsSync(ACTIVITY_FILE) ? readFileSync(ACTIVITY_FILE, 'utf8') : null);
writeFileSync(ACTIVITY_FILE, `${JSON.stringify({ days: recordDay(days, todayString()) }, null, 2)}\n`);
console.log(`今日の活用を記録しました。内容は ${LOCAL_DIR}/log.md に残り、誰にも見えません。日付だけが ${ACTIVITY_FILE} に残ります。`);
