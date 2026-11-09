// コースの更新を確かめる。受講者が了承した版だけを --apply=<版> で適用する。
// 受講者が書いたファイルには触らない。Claude Code の設定は、決まった項目だけを追加する。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function configuredRemote() {
  try {
    return `https://github.com/${JSON.parse(readFileSync(join('course', 'config.json'), 'utf8')).courseRepo}.git`;
  } catch {
    return 'https://github.com/ohigashi/ai-course.git';
  }
}

const remote = process.env.AI_COURSE_REMOTE || configuredRemote();
const COURSE_PATHS = ['course', 'scripts', '.claude/skills'];
const SETTINGS_PATH = join('.claude', 'settings.json');
const REMINDER_COMMAND = 'node scripts/session-reminder.mjs';
const STATUS_COMMAND = 'node scripts/statusline.mjs';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const applyArg = process.argv.find((a) => a.startsWith('--apply='))?.slice('--apply='.length);

// 読めない設定は null を返し、書き換えない。
function readSettings() {
  if (!existsSync(SETTINGS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function hasReminder(settings) {
  return (settings.hooks?.SessionStart ?? []).some((e) => e.hooks?.some((h) => h.command === REMINDER_COMMAND));
}

function settingsMissing() {
  const settings = readSettings();
  return settings !== null && (!hasReminder(settings) || !settings.statusLine);
}

function addCourseSettings() {
  const settings = readSettings();
  if (settings === null) return;
  if (!hasReminder(settings)) {
    settings.hooks = { ...settings.hooks };
    settings.hooks.SessionStart = [
      ...(settings.hooks.SessionStart ?? []),
      { hooks: [{ type: 'command', command: REMINDER_COMMAND }] },
    ];
  }
  settings.statusLine ??= { type: 'command', command: STATUS_COMMAND };
  mkdirSync('.claude', { recursive: true });
  writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`);
}

function check() {
  try {
    git('remote', 'set-url', 'course', remote);
  } catch {
    git('remote', 'add', 'course', remote);
  }
  git('fetch', '--quiet', 'course', 'main');
  const sha = git('rev-parse', 'course/main').trim();
  // D は受講者の手元にだけあるファイル。受講者が作ったスキルなどなので、更新として扱わない。
  const changes = git('diff', '--no-renames', '--no-ext-diff', '--name-status', '-R', sha, '--', ...COURSE_PATHS)
    .split('\n').filter((line) => line && !line.startsWith('D')).join('\n');
  const settingsLine = settingsMissing() ? 'A\t.claude/settings.json(画面下の現在地の表示と、CLAUDE.md の見直しの案内を追加)' : '';
  const lines = [changes, settingsLine].filter(Boolean).join('\n');
  console.log(lines ? `更新があります(版: ${sha})\n${lines}` : 'コースは最新です。');
}

try {
  if (applyArg === undefined) {
    check();
  } else if (/^[0-9a-f]{40}$/.test(applyArg)) {
    git('checkout', applyArg, '--', ...COURSE_PATHS);
    addCourseSettings();
    console.log('コースを更新しました。');
  } else {
    console.log('版の指定が正しくないので、手元の版で続けます。');
  }
} catch {
  console.log('コースの更新を確かめられなかったので、手元の版で続けます。');
}
