// Sharing a picture: "Save as image" downloads it, "Copy image" puts it on the clipboard. A picture made on the spot takes a moment, and some
// browsers (Safari above all) only allow a copy right after the click, so the copy is started at once with the picture still being made.
// A copy that cannot be done never turns into a download behind the user's back: it says so, and the Save button stays there.
export async function shareImage(mode, makeBlob, filename, { t, toast }) {
  const blob = makeBlob();   // a promise of the PNG
  if (mode === 'copy') {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) { toast(t('This browser cannot copy images: use "Save as image".'), true); return false; }
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast(t('Image copied.')); return true; }
    catch { toast(t('The image could not be copied: use "Save as image".'), true); return false; }
  }
  const file = await blob;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: filename });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}
