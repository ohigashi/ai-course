// 取り組み(works.json)を操作する。/work から使う。
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { todayString } from './activity.mjs';
import { createEnv, evaluate, loadRules } from './check.mjs';
import { WORKS_FILE, defaultWorks, parseWorks, roundCount, syncRounds } from './works.mjs';

const MAX_WORKS = 20;
const NAME_LIMIT = 120;
const PHASES = [1, 2, 3, 4];
const STATES = ['active', 'paused'];
// 取り組みごとに持つ文書の元になる、フェーズ1と2の判定の段階(rules.json の id)
const DOC_STAGES = [2, 1, 3, 4, 5];

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, NAME_LIMIT) : '');

function mustFind(works, slug) {
  if (!works.some((w) => w.slug === slug)) throw new Error(`取り組み「${slug}」は見つかりません。/work list で確認してください。`);
}
function mustPhase(phase) {
  if (!PHASES.includes(phase)) throw new Error('フェーズは 1 から 4 の数字で指定してください。');
}
const update = (works, slug, today, change) => {
  mustFind(works, slug);
  return works.map((w) => (w.slug === slug ? { ...w, ...change(w), touchedAt: today } : w));
};

export function addWork(works, name, phase, today) {
  const clear = clean(name);
  if (!clear) throw new Error('取り組みの名前を指定してください。');
  mustPhase(phase);
  if (works.length >= MAX_WORKS) throw new Error(`取り組みは ${MAX_WORKS} 件までです。`);
  const highest = Math.max(0, ...works.map((w) => Number(/^w(\d+)$/.exec(w.slug)?.[1] ?? 0)));
  return [...works, { slug: `w${highest + 1}`, name: clear, phase, state: 'active', next: '', rounds: [], startedAt: today, touchedAt: today }];
}

export function moveWork(works, slug, phase, today) {
  mustPhase(phase);
  return update(works, slug, today, () => ({ phase }));
}

export function setWorkNext(works, slug, text, today) {
  return update(works, slug, today, () => ({ next: clean(text) }));
}

export function setWorkState(works, slug, state, today) {
  if (!STATES.includes(state)) throw new Error('状態は active か paused です。');
  return update(works, slug, today, () => ({ state }));
}

export function closeRound(works, slug, today) {
  mustFind(works, slug);
  const work = works.find((w) => w.slug === slug);
  if (work.phase <= 2 && roundCount(work, work.phase) < 1) {
    throw new Error(`フェーズ${work.phase}は、最初の1回の判定が通るまで一区切りにできません。/next で判定を進めてください。`);
  }
  return update(works, slug, today, (w) => ({ rounds: [...w.rounds, { phase: w.phase, date: today }] }));
}

// ---- CLI ----

const courseRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fail = (message) => {
  console.log(message);
  process.exit(1);
};

// 取り組み用の文書の元は course/templates/ のひな形。受講者が書いた docs/ は使わない。
function copyTemplates(repoDir, slug) {
  const docs = join(repoDir, 'works', slug, 'docs');
  const files = loadRules().filter((r) => DOC_STAGES.includes(r.id)).flatMap((r) => r.checks).map((c) => c.path).filter((p) => p?.startsWith('docs/'));
  const sources = [...new Set(files)].map((path) => join(courseRoot, 'course', 'templates', path.split('/').pop()));
  const missing = sources.find((src) => !existsSync(src));
  if (missing) throw new Error(`文書のひな形 ${missing} が見つかりません。コースの教材を更新してからやり直してください。何も作っていません。`);
  mkdirSync(docs, { recursive: true });
  for (const src of sources) {
    const dest = join(docs, src.split('/').pop());
    if (!existsSync(dest)) cpSync(src, dest);
  }
  for (const dir of ['work', 'app']) {
    mkdirSync(join(repoDir, 'works', slug, dir), { recursive: true });
    if (!existsSync(join(repoDir, 'works', slug, dir, '.gitkeep'))) writeFileSync(join(repoDir, 'works', slug, dir, '.gitkeep'), '');
  }
}

function main(args) {
  const repoDir = process.cwd();
  const today = todayString();
  const file = join(repoDir, WORKS_FILE);
  const raw = existsSync(file) ? readFileSync(file, 'utf8') : null;
  const stored = parseWorks(raw);
  if (stored === null) fail(`${WORKS_FILE} が壊れています。何も書き換えていません。大東に相談してください。`);
  const evaluated = evaluate(repoDir, loadRules(), createEnv(repoDir, { assumeInvited: true }));
  const current = stored.length ? stored : defaultWorks(evaluated, today);
  const save = (works) => writeFileSync(file, `${JSON.stringify({ items: works }, null, 2)}\n`);
  const [cmd, ...rest] = args;

  try {
    if (cmd === 'list') {
      for (const w of evaluated.works) {
        console.log(`${w.slug}  ${w.name}  フェーズ${w.phase}  ${w.state === 'paused' ? '休み中' : '進行中'}`);
        console.log(`  次にやること: ${w.nextAction}`);
      }
    } else if (cmd === 'sync') {
      const next = syncRounds(current, evaluated.works, today);
      if (raw === null || JSON.stringify(next) !== JSON.stringify(stored)) save(next);
      console.log('取り組みの回数を、判定の結果に更新しました。');
    } else if (cmd === 'new') {
      const at = rest.indexOf('--phase');
      const phase = at >= 0 ? Number(rest[at + 1]) : 1;
      const name = rest.filter((_, i) => i !== at && i !== at + 1 || at < 0).join(' ');
      if (!evaluated.setupDone) fail('環境づくりがまだ終わっていないので、取り組みは始められません。/next で環境づくりを進めてください。');
      const works = addWork(current, name, phase, today);
      const slug = works.at(-1).slug;
      copyTemplates(repoDir, slug);
      save(works);
      console.log(`取り組み「${works.at(-1).name}」を始めました(${slug})。works/${slug}/ に文書の置き場を作りました。`);
    } else if (cmd === 'move') {
      const [slug, phase] = rest;
      save(moveWork(current, slug, Number(phase), today));
      console.log(`取り組み ${slug} をフェーズ${phase}に動かしました。`);
    } else if (cmd === 'next') {
      const [slug, ...words] = rest;
      if (!words.join(' ').trim()) throw new Error('次にやることの文章を指定してください。何も書き換えていません。');
      save(setWorkNext(current, slug, words.join(' '), today));
      console.log(`取り組み ${slug} の次にやることを書き換えました。`);
    } else if (cmd === 'pause' || cmd === 'resume') {
      save(setWorkState(current, rest[0], cmd === 'pause' ? 'paused' : 'active', today));
      console.log(`取り組み ${rest[0]} を${cmd === 'pause' ? '休みにしました' : '再開しました'}。`);
    } else if (cmd === 'round') {
      // 保存済みの回数が古いことがあるので、先に判定の結果を反映する
      const synced = syncRounds(current, evaluated.works, today);
      const before = current.find((x) => x.slug === rest[0]);
      const after = synced.find((x) => x.slug === rest[0]);
      if (before && roundCount(after, after.phase) > roundCount(before, before.phase)) {
        save(synced);
        console.log(`取り組み ${after.slug} のフェーズ${after.phase}の1回目は、判定が通ったので記録しました。もう1回やったときに、もう一度 round を実行してください。`);
      } else {
        const works = closeRound(synced, rest[0], today);
        save(works);
        const w = works.find((x) => x.slug === rest[0]);
        console.log(`取り組み ${w.slug} のフェーズ${w.phase}を一区切りにしました(${roundCount(w, w.phase)}回目)。`);
      }
    } else {
      fail('使い方: node scripts/work.mjs list | sync | new <名前> [--phase N] | move <slug> <N> | next <slug> <文> | pause <slug> | resume <slug> | round <slug>');
    }
  } catch (error) {
    fail(error.message);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
