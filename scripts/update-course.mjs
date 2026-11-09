// コースの最新の教材を取り込む。受講者が書いたファイルには触らない。
// 実行されるスクリプトとスキルは、受講者が確認したあと --apply-code を付けたときだけ更新する。
import { execFileSync } from 'node:child_process';

const remote = process.env.AI_COURSE_REMOTE || 'https://github.com/ohigashi/ai-course.git';
const CODE_PATHS = ['scripts', '.claude/skills'];
const applyCode = process.argv.includes('--apply-code');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

try {
  try {
    git('remote', 'set-url', 'course', remote);
  } catch {
    git('remote', 'add', 'course', remote);
  }
  git('fetch', '--quiet', 'course', 'main');
  git('checkout', 'course/main', '--', 'course');
  if (applyCode) git('checkout', 'course/main', '--', ...CODE_PATHS);
  console.log('教材を最新の版にしました。');
  const changed = git('diff', '--name-only', 'course/main', '--', ...CODE_PATHS).split('\n').filter(Boolean);
  if (changed.length) console.log(`仕組みの更新があります:\n${changed.join('\n')}`);
} catch {
  console.log('コースの最新の版を取り込めなかったので、手元の版で続けます。');
}
