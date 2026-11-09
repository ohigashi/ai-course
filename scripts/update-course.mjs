// コースの更新を確かめる。受講者が了承した版だけを --apply=<版> で適用する。
// 受講者が書いたファイルには触らない。
import { execFileSync } from 'node:child_process';

const remote = process.env.AI_COURSE_REMOTE || 'https://github.com/ohigashi/ai-course.git';
const COURSE_PATHS = ['course', 'scripts', '.claude/skills'];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const applyArg = process.argv.find((a) => a.startsWith('--apply='))?.slice('--apply='.length);

function check() {
  try {
    git('remote', 'set-url', 'course', remote);
  } catch {
    git('remote', 'add', 'course', remote);
  }
  git('fetch', '--quiet', 'course', 'main');
  const sha = git('rev-parse', 'course/main').trim();
  const changes = git('diff', '--no-renames', '--no-ext-diff', '--name-status', '-R', sha, '--', ...COURSE_PATHS).trim();
  console.log(changes ? `更新があります(版: ${sha})\n${changes}` : 'コースは最新です。');
}

try {
  if (applyArg === undefined) {
    check();
  } else if (/^[0-9a-f]{40}$/.test(applyArg)) {
    git('checkout', applyArg, '--', ...COURSE_PATHS);
    console.log('コースを更新しました。');
  } else {
    console.log('版の指定が正しくないので、手元の版で続けます。');
  }
} catch {
  console.log('コースの更新を確かめられなかったので、手元の版で続けます。');
}
