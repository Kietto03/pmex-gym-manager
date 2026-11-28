// How fresh an outside data source is (no DOM; also used by the sync tools).
export const ageDays = (iso, now = Date.now()) => (iso ? Math.floor((now - Date.parse(iso)) / 864e5) : Infinity);
// 'fresh' | 'stale' | 'failed' | 'manual' | 'never'
export function health(s, now = Date.now()) {
  if (!s) return 'never';
  if (s.ok === null) return 'manual';
  if (s.ok === false) return s.lastOk ? 'failed' : 'never';
  return ageDays(s.lastOk, now) > (s.staleAfterDays ?? 7) ? 'stale' : 'fresh';
}
// "just now", "5 h ago", "3 days ago": [unit, n] so the page can translate it
export function ago(iso, now = Date.now()) {
  if (!iso) return null;
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 6e4));
  return m < 2 ? ['now', 0] : m < 120 ? ['min', m] : m < 2880 ? ['h', Math.round(m / 60)] : ['d', Math.round(m / 1440)];
}
