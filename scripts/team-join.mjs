// チームのリポジトリからの招待だけを承諾し、自分のフォルダの隣に取得または更新する。
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig } from './check.mjs';
import { selectTeamInvitation } from './status.mjs';

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

try {
  const { teamRepo } = loadConfig();
  for (const invitation of selectTeamInvitation(JSON.parse(gh('api', 'user/repository_invitations')), teamRepo)) {
    gh('api', '--method', 'PATCH', `user/repository_invitations/${invitation.id}`);
    console.log('チームのリポジトリへの招待を承諾しました。');
  }
  const target = resolve('..', teamRepo.split('/')[1]);
  if (existsSync(join(target, '.git'))) {
    execFileSync('git', ['pull', '--quiet'], { cwd: target, stdio: 'ignore' });
  } else {
    gh('repo', 'clone', teamRepo, target, '--', '--quiet');
  }
  console.log(`チームのフォルダ: ${target}`);
} catch {
  console.log('チームのリポジトリに入れませんでした。共有の了承がまだか、大東の招待を待っている状態です。');
}
