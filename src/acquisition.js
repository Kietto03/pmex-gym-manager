// How a sync pair was obtained, ranked the way the gym orders its roster:
// Arc Fair (AF) > EX Master Fair (ExMF) > Master Fair (MF) > EX Fair > Poké Fair (PF) > everything else.
export const ACQ_GROUPS = [['AF', /Arc Suit Fair/i], ['ExMF', /EX Master Fair/i], ['MF', /^Master Fair/i], ['Ex Fair', /^EX Fair/i], ['PF', /^Pok(é|e|emon)\s+Fair/i]];
export const acqRank = acq => { const i = ACQ_GROUPS.findIndex(([, re]) => re.test(String(acq || '').normalize('NFC'))); return i < 0 ? ACQ_GROUPS.length : i; };
export const acqLabel = acq => ACQ_GROUPS[acqRank(acq)]?.[0] || 'Etc';
// Compare two pairs: acquisition group first, then release date (newest first)
export const byAcquisition = (a, b) => acqRank(a.acquisition) - acqRank(b.acquisition) || String(b.release || '').localeCompare(String(a.release || ''));
