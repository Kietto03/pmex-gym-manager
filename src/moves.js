// How a move or passive text from the datamine is split for reading (no DOM).
// "Activation Condition: … Deactivation Condition: … <effect text>" becomes three parts; the deactivation condition is
// its first sentence ("Sp. Atk" is not a sentence end).
export function splitDescription(text) {
  const s = String(text || '').trim();
  const a = /Activation Condition:\s*/i.exec(s);
  if (!a) return { activation: '', deactivation: '', rest: s };
  const afterA = s.slice(a.index + a[0].length), d = /Deactivation Condition:\s*/i.exec(afterA);
  if (!d) return { activation: afterA.trim(), deactivation: '', rest: s.slice(0, a.index).trim() };
  const activation = afterA.slice(0, d.index).trim(), afterD = afterA.slice(d.index + d[0].length);
  const end = /(?<!\bSp)\.\s+(?=[A-Z↑'‘“])/.exec(afterD);
  const deactivation = (end ? afterD.slice(0, end.index + 1) : afterD).trim(), rest = end ? afterD.slice(end.index + end[0].length).trim() : '';
  return { activation, deactivation, rest: `${s.slice(0, a.index).trim()} ${rest}`.trim() };
}
// "2" → 2; "--", "", undefined → 0 (a gauge cost / a use limit written as a number)
export const count = v => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : 0; };
