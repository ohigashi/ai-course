// Claude Code を開いたときに、CLAUDE.md の見直しの時期なら案内を出す。失敗しても作業を止めない。
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeMdStatus, createEnv, reminderText } from './check.mjs';

try {
  const repoDir = dirname(dirname(fileURLToPath(import.meta.url)));
  const text = reminderText(claudeMdStatus(repoDir, createEnv(repoDir)));
  if (text) console.log(text);
} catch {
  // 案内は補助なので、何も表示せずに終える
}
