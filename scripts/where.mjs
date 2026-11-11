// /next の最初に、コースを進められる場所かを確かめる。
// Remote(クラウド)の Claude Code では、判定と保存が正しく動かないので止める。
// main 以外のブランチは、試している途中のことがあるので止めずに知らせる。
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function whereCheck({ remote, branch }) {
  if (remote) {
    return {
      stop: true,
      message: 'この Claude Code は Remote(クラウド)で動いています。コースは自分のパソコンで進めます。新しいセッションを始め、入力欄の下で環境を Local にして、フォルダ ai-course-ユーザー名 を開いてから /next を入力してください。',
    };
  }
  if (branch && branch !== 'main') {
    return { stop: false, message: `いまはブランチ ${branch} にいます。状態の保存はこのブランチに入り、main に取り込むまで ac.hyperdash.app の表示には出ません。試している途中なら、このまま続けて構いません。` };
  }
  return { stop: false, message: '' };
}

function currentBranch() {
  try {
    return execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { stop, message } = whereCheck({ remote: process.env.CLAUDE_CODE_REMOTE === 'true', branch: currentBranch() });
  if (message) console.log(message);
  process.exitCode = stop ? 1 : 0;
}
