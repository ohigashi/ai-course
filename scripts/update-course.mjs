// コースの最新の教材と仕組みだけを取り込む。受講者が書いたファイルには触らない。
import { execFileSync } from 'node:child_process';

const remote = process.env.AI_COURSE_REMOTE || 'https://github.com/ohigashi/ai-course.git';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

try {
  try {
    git('remote', 'set-url', 'course', remote);
  } catch {
    git('remote', 'add', 'course', remote);
  }
  git('fetch', '--quiet', 'course', 'main');
  git('checkout', 'course/main', '--', 'course', 'scripts', '.claude/skills');
  console.log('コースを最新の版にしました。');
} catch {
  console.log('コースの最新の版を取り込めなかったので、手元の版で続けます。');
}
