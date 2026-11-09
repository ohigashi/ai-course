// 日々の活用の記録(日付だけ)と、学ぶ〜継続の5段階を扱う。
export const PHASES = ['学ぶ', '試す', '慣れる', '仕組みとして実装する', '継続される'];

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS_FOR_CONTINUING = 3;
const pad = (n) => String(n).padStart(2, '0');

export const todayString = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

export const recordDay = (days, today) => [...new Set([...days, today])].sort();

export function parseActivity(text) {
  if (text === null) return [];
  try {
    const days = JSON.parse(text)?.days;
    return Array.isArray(days) ? days.filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  } catch {
    return [];
  }
}

const monthKey = (year, month) => `${year}-${pad(month + 1)}`;

export function activitySummary(days, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ago = (day) => Math.round((today - new Date(`${day}T00:00:00`)) / DAY_MS);
  const recent = days.map(ago).filter((n) => n >= 0);
  const weeks = new Set(recent.filter((n) => n < 28).map((n) => Math.floor(n / 7)));
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const inMonth = (key) => days.filter((d) => d.startsWith(key)).length;
  const continuedAt = (end) => new Set(days.map((d) => (Date.parse(`${end}T00:00:00`) - Date.parse(`${d}T00:00:00`)) / DAY_MS)
    .filter((n) => n >= 0 && n < 28).map((n) => Math.floor(n / 7))).size >= WEEKS_FOR_CONTINUING;
  return {
    everContinued: days.some(continuedAt),
    weekDays: recent.filter((n) => n < 7).length,
    weeksActive: weeks.size,
    monthDays: inMonth(monthKey(now.getFullYear(), now.getMonth())),
    prevMonthDays: inMonth(monthKey(prev.getFullYear(), prev.getMonth())),
  };
}

export function phaseOf(result, activity, stepups) {
  const stage = result.currentStage;
  if (stage !== null && stage < 2) return '学ぶ';
  if (stage === 2) return '試す';
  if (stage === null || stage >= 4 || stepups >= 1) {
    return activity.everContinued || activity.weeksActive >= WEEKS_FOR_CONTINUING ? '継続される' : '仕組みとして実装する';
  }
  return '慣れる';
}
