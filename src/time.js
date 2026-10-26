/* ═══════════════════════════════════════════════════════════════
   Time zones: IANA names (Asia/Ho_Chi_Minh) only, never a fixed offset.
   The database stores UTC; these helpers show it in a chosen zone and
   turn a wall-clock time typed in that zone back into UTC.
   ═══════════════════════════════════════════════════════════════ */
const FALLBACK = ['UTC', 'Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Manila', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Hong_Kong',
  'Asia/Shanghai', 'Asia/Taipei', 'Asia/Seoul', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Moscow', 'America/Sao_Paulo', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Pacific/Honolulu'];

export const browserTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
export const validTz = tz => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return !!tz; } catch { return false; } };
export const allTimezones = () => { try { return Intl.supportedValuesOf('timeZone'); } catch { return FALLBACK; } };

const parts = (ms, tz) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  .formatToParts(new Date(ms)).filter(p => p.type !== 'literal').map(p => [p.type, +p.value]));
// Offset of a zone at an instant, in ms (positive east of UTC)
const offsetAt = (ms, tz) => { const p = parts(ms, tz); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000; };

// "2026-10-26T14:30" (what <input type=datetime-local> holds) for an instant, as seen in `tz`
export function toLocalInput(iso, tz) {
  const p = parts(Date.parse(iso), tz || browserTz()), z = n => String(n).padStart(2, '0');
  return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}
// The reverse: a wall-clock string typed in `tz` → ISO instant in UTC (handles DST by iterating the offset)
export function fromLocalInput(str, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(str || '');
  if (!m) return null;
  tz = tz || browserTz();
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let ms = wall - offsetAt(wall, tz);
  ms = wall - offsetAt(ms, tz);
  return new Date(ms).toISOString();
}
// Local clock of someone in another zone: { time: "21:05", day: 0 | +1 | -1 (days apart from the viewer), tz }
export function clockIn(tz, viewerTz, now = Date.now(), locale) {
  const time = new Intl.DateTimeFormat(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(now));
  const a = parts(now, tz), b = parts(now, viewerTz || browserTz());
  const day = Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 864e5);
  return { time, day, tz };
}
