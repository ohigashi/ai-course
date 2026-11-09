// 日々の記録を置く .local を GitHub に上げないようにする。
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const LOCAL_DIR = '.local';

export function ensureLocalExcluded() {
  const path = execFileSync('git', ['rev-parse', '--git-path', 'info/exclude'], { encoding: 'utf8' }).trim();
  mkdirSync(dirname(path), { recursive: true });
  const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (!current.split(/\r?\n/).includes(`${LOCAL_DIR}/`)) appendFileSync(path, `\n${LOCAL_DIR}/\n`);
}

export function localDirIsTracked() {
  return execFileSync('git', ['ls-files', LOCAL_DIR], { encoding: 'utf8' }).trim() !== '';
}
