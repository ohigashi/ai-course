// Claude Code を開いたときに、CLAUDE.md の見直しの時期なら案内を出す。失敗しても作業を止めない。
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { claudeMdStatus, createEnv, reminderText, updateReminderText } from './check.mjs';

try {
  const repoDir = dirname(dirname(fileURLToPath(import.meta.url)));
  const text = reminderText(claudeMdStatus(repoDir, createEnv(repoDir)));
  if (text) console.log(text);
  const output = execFileSync(process.execPath, [join(repoDir, 'scripts', 'update-course.mjs')], { cwd: repoDir, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] });
  const update = updateReminderText(output);
  if (update) console.log(update);
} catch {
  // 案内は補助なので、何も表示せずに終える
}
