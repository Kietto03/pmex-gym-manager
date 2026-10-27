// Admin → Data updates: when each outside source was last refreshed by the scheduled sync, and whether it needs a look.
import { esc, fmtDT, S } from '../core.js';
import { ico } from '../icons.js';
import { t } from '../i18n.js';
import { health, ago } from '../freshness.js';

const BADGE = { fresh: ['good', 'Up to date'], stale: ['gold', 'Getting old'], failed: ['bad', 'Last try failed'], manual: ['', 'By hand'], never: ['bad', 'Never synced'] };
const AGO = { now: () => t('just now'), min: n => t('{n} min ago', { n }), h: n => t('{n} h ago', { n }), d: n => t('{n} days ago', { n }) };
const REPO = 'https://github.com/Kietto03/pmex-gym-manager/actions/workflows/sync-data.yml';

export const freshnessIssues = () => Object.values(S.syncStatus?.sources || {}).filter(s => ['stale', 'failed', 'never'].includes(health(s))).length;

export function dataFreshness() {
  const st = S.syncStatus;
  if (!st?.sources) return `<div class="card pad"><p class="muted">${t('No sync report yet. It appears after the first scheduled sync.')}</p></div>`;
  const rows = Object.entries(st.sources).map(([id, s]) => ({ id, s, h: health(s) }));
  const a = ago(st.generated);
  return `<div class="card pad"><h2 class="title">${t('Data updates')}</h2>
    <p class="muted">${t('A scheduled job refreshes these sources every 6 hours and publishes the site when something changed. If a source fails, the site keeps its last good copy.')}
      ${a ? `${t('Last report')}: ${AGO[a[0]](a[1])}.` : ''} <a href="${REPO}" target="_blank" rel="noopener noreferrer">${t('Open the job (run it now)')}</a></p>
    <div class="card scroll"><table class="table"><thead><tr><th>${t('Source')}</th><th>${t('Feeds')}</th><th>${t('State')}</th><th>${t('Last good')}</th><th>${t('Holds')}</th></tr></thead>
    <tbody>${rows.map(({ s, h }) => { const [cls, label] = BADGE[h], l = ago(s.lastOk);
      return `<tr class="${h === 'fresh' ? '' : ''}"><td><b>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a>` : esc(s.label)}</b></td><td class="muted">${esc(s.feeds || '')}</td>
        <td><span class="badge ${cls}">${t(label)}</span>${s.error ? `<br><small class="muted">${esc(s.error)}</small>` : ''}</td>
        <td class="nowrap" title="${s.lastOk ? esc(fmtDT(s.lastOk)) : ''}">${l ? AGO[l[0]](l[1]) : '—'}</td>
        <td class="muted">${s.items != null ? `${s.items}` : ''}${s.note ? ` · ${esc(s.note)}` : ''}</td></tr>`; }).join('')}</tbody></table></div></div>`;
}
