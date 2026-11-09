// チームのリポジトリからの招待だけを承諾し、自分のフォルダの隣に取得または更新する。
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig } from './check.mjs';
import { selectTeamInvitation } from './status.mjs';

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

let target;
try {
  const { teamRepo } = loadConfig();
  for (const invitation of selectTeamInvitation(JSON.parse(gh('api', 'user/repository_invitations')), teamRepo)) {
    gh('api', '--method', 'PATCH', `user/repository_invitations/${invitation.id}`);
    console.log('チームのリポジトリへの招待を承諾しました。');
  }
  target = resolve('..', teamRepo.split('/')[1]);
  if (!existsSync(join(target, '.git'))) gh('repo', 'clone', teamRepo, target, '--', '--quiet');
} catch {
  console.log('チームのリポジトリに入れませんでした。共有の了承がまだか、招待が届いていない状態です。');
  process.exit(0);
}

try {
  execFileSync('git', ['fetch', '--quiet', 'origin'], { cwd: target, stdio: 'ignore' });
} catch {
  console.log('チームの最新の状態を取得できませんでした。手元の内容を表示します。');
}
console.log(`チームのフォルダ: ${target}`);
