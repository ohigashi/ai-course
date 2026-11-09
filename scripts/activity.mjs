// 日々の活用の記録(日付だけ)を扱う。LEGACY_PHASES は古い版の progress.json と節目の読み取り用。
export const LEGACY_PHASES = ['学ぶ', '試す', '慣れる', '仕組みとして実装する', '継続される'];

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 3660;
const pad = (n) => String(n).padStart(2, '0');

export const todayString = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

export const recordDay = (days, today) => [...new Set([...days, today])].sort();

export const isRealDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
  && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);

export function parseActivity(text) {
  if (text === null) return [];
  try {
    const days = JSON.parse(text)?.days;
    if (!Array.isArray(days)) return [];
    return [...new Set(days.filter(isRealDate))].sort().slice(-MAX_DAYS);
  } catch {
    return [];
  }
}

const monthKey = (year, month) => `${year}-${pad(month + 1)}`;

export function activitySummary(days, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ago = (day) => Math.round((today - new Date(`${day}T00:00:00`)) / DAY_MS);
  const recent = days.map(ago).filter((n) => n >= 0);
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const inMonth = (key) => days.filter((d) => d.startsWith(key)).length;
  return {
    weekDays: recent.filter((n) => n < 7).length,
    monthDays: inMonth(monthKey(now.getFullYear(), now.getMonth())),
    prevMonthDays: inMonth(monthKey(prev.getFullYear(), prev.getMonth())),
  };
}
