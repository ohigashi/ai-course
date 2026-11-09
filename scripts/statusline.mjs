// Claude Code の画面下に、コースの現在地を1行で表示する。通信はしない。失敗しても作業を止めない。
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, createEnv, loadRules } from './check.mjs';
import { loadRoadmap, statusLine } from './roadmap.mjs';

try {
  const repoDir = dirname(dirname(fileURLToPath(import.meta.url)));
  console.log(statusLine(evaluate(repoDir, loadRules(), createEnv(repoDir, { assumeInvited: true })), loadRoadmap()));
} catch {
  console.log('コース');
}
