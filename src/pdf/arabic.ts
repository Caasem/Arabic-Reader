/** Shared Arabic text helpers for the PDF module (import, quality test and the pages view). */

const PRESENTATION_FORMS = /[ﭐ-﷿ﹰ-﻿]+/g;
const INVISIBLE = /[‎‏‪-‮⁦-⁩­﻿]/g;

/** Presentation forms (the shaped glyph codes some PDFs hold) back to plain letters; tatweel and bidi marks dropped. */
export function normalizeArabic(text: string): string {
  return text.replace(PRESENTATION_FORMS, (m) => m.normalize('NFKC')).replace(INVISIBLE, '').replace(/ـ/g, '');
}
