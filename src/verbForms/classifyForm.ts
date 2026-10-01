/** Arabic verb forms (أوزان), numbered I-X. */
export type VerbForm = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII' | 'VIII' | 'IX' | 'X';

/**
 * The verb form of a dictionary lemma, read off its spelling pattern. The
 * input is the AraMorph lemma in Buckwalter transliteration, without its
 * `-u`/`-a`/`-i` and `_n` markers (e.g. `kAtab`, `>akotab`, `{isotaEolam`).
 * Each pattern is the template of that form with the root letters left open:
 *
 *   I    CaCaC / CaCiC / CaCuC       VI   taCAaC
 *   II   CaC~aC                      VII  {inoCaCaC
 *   III  CAaC                        VIII {iCotaCaC  ({iC~aCaC when assimilated)
 *   IV   >aCoCaC (>aCAC if hollow)   IX   {iCoCaC~
 *   V    taCaC~aC                    X    {isotaCoCaC
 *
 * Returns undefined for anything else (hollow and defective Form I verbs,
 * four-letter roots, nouns): better no badge than a wrong one.
 */
export function classifyVerbForm(lemma: string): VerbForm | undefined {
  if (/^\{ino./.test(lemma)) return 'VII';
  if (/^\{iso?ta./.test(lemma)) return 'X';
  if (/^\{i.o.a.~$/.test(lemma) || /^\{i.o.a~/.test(lemma)) return 'IX';
  if (/^\{i.ota./.test(lemma) || /^\{i.~a./.test(lemma)) return 'VIII';
  if (/^>a.[oA]/.test(lemma)) return 'IV';
  if (/^ta.A./.test(lemma)) return 'VI';
  if (/^ta.a.~a/.test(lemma)) return 'V';
  if (/^.A.a./.test(lemma)) return 'III';
  if (/^.a.~a./.test(lemma)) return 'II';
  if (/^.a.[aiu].$/.test(lemma)) return 'I';
  return undefined;
}
