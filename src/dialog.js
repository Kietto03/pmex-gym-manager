/* ═══════════════════════════════════════════════════════════════
   The app's own dialogs, in place of the browser's confirm() / prompt():
   they follow the chosen style and colour mode, read well on a phone,
   and say what the button will do ("Delete", not "OK").
     await ask(text, { title, ok, danger })            → true / false
     await askText(text, { title, label, expect, … })  → the text, or null when cancelled
     await showText(text, { title, value })            → shows a value with a Copy button
     await showSheet(title, html)                      → a panel of ready-made (escaped) HTML, with a Close button
   Esc or a tap outside cancels; Enter confirms; focus comes back where it was.
   ═══════════════════════════════════════════════════════════════ */
import { t } from './i18n.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lines = s => esc(s).split('\n').map(l => `<p>${l}</p>`).join('');
let open = null;   // one dialog at a time: a second call closes the first as cancelled

function show({ title, text = '', html = '', ok, cancel = t('Cancel'), danger = false, input = null, copy = null }) {
  open?.(null);
  const back = document.activeElement;
  const el = document.createElement('div');
  el.className = 'dlg-wrap';
  el.innerHTML = `<div class="dlg ${danger ? 'danger' : ''} ${html ? 'sheet' : ''}" role="${input || copy || html ? 'dialog' : 'alertdialog'}" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-text">
    <h2 id="dlg-title">${esc(title)}</h2>
    <div id="dlg-text" class="dlg-text">${text ? lines(text) : ''}${html}</div>
    ${input ? `<label class="dlg-field">${esc(input.label || '')}<input id="dlg-input" autocomplete="off" spellcheck="false" placeholder="${esc(input.placeholder || '')}" value="${esc(input.value || '')}"></label>` : ''}
    ${copy != null ? `<div class="dlg-copy"><code id="dlg-value">${esc(copy)}</code><button type="button" class="btn sm" data-dlg-copy>${t('Copy')}</button></div>` : ''}
    <div class="dlg-btns">${cancel ? `<button type="button" class="btn ghost" data-dlg="no">${esc(cancel)}</button>` : ''}
      <button type="button" class="btn ${danger ? 'danger-solid' : 'primary'}" data-dlg="yes">${esc(ok)}</button></div>
  </div>`;
  document.body.append(el);
  document.body.classList.add('dlg-open');
  const field = el.querySelector('#dlg-input'), yes = el.querySelector('[data-dlg=yes]');
  const ready = () => !input?.expect || field.value.trim() === input.expect;
  if (field) { const sync = () => { yes.disabled = !ready(); }; field.addEventListener('input', sync); sync(); }
  // focusing a button at the bottom of a long panel would scroll it there: the panel opens at its top
  requestAnimationFrame(() => { el.classList.add('in'); (field || (danger ? el.querySelector('[data-dlg=no]') : yes) || yes).focus({ preventScroll: true }); el.querySelector('.dlg').scrollTop = 0; });
  return new Promise(resolve => {
    const done = v => {
      if (open !== done) return;
      open = null;
      el.classList.remove('in');
      document.body.classList.remove('dlg-open');
      setTimeout(() => el.remove(), 160);
      back?.focus?.({ preventScroll: true });
      resolve(v);
    };
    open = done;
    el.addEventListener('click', async e => {
      if (e.target === el) return done(null);   // the backdrop
      if (e.target.closest('[data-dlg-copy]')) {
        try { await navigator.clipboard.writeText(copy); e.target.textContent = t('Copied'); }
        catch { getSelection().selectAllChildren(el.querySelector('#dlg-value')); }
        return;
      }
      const b = e.target.closest('[data-dlg]');
      if (!b) return;
      if (b.dataset.dlg === 'no') done(null);
      else if (ready()) done(field ? field.value.trim() : true);
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); done(null); }
      else if (e.key === 'Enter' && !e.isComposing && (field ? e.target === field : true) && ready()) { e.preventDefault(); done(field ? field.value.trim() : true); }
      else if (e.key === 'Tab') {   // keep the focus inside the dialog
        const f = [...el.querySelectorAll('button:not([disabled]), input')];
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
  });
}

export const ask = (text, { title = t('Are you sure?'), ok = t('Confirm'), danger = false } = {}) => show({ title, text, ok, danger }).then(v => v === true);
export const askText = (text, { title = t('Are you sure?'), ok = t('Confirm'), danger = false, label = '', expect = null, value = '', placeholder = '' } = {}) =>
  show({ title, text, ok, danger, input: { label, expect, value, placeholder } }).then(v => (typeof v === 'string' ? v : null));
export const showText = (text, { title, value, ok = t('Done') } = {}) => show({ title, text, ok, cancel: null, copy: value }).then(() => undefined);
export const showSheet = (title, html) => show({ title, html, ok: t('Close'), cancel: null }).then(() => undefined);
