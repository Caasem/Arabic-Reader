const MAX_WORDS = 3;

/**
 * The first few words of an Al-Wasit entry's definition, for its dock tab:
 * "(قَتَرَ) فلانٌ -ُ قَتْرًا: ضاق عَيْشُه. و - على عياله ..." gives "ضاق عَيْشُه".
 * Takes the text after the headword line's colon (or after the "(form)" when
 * there is no colon nearby) and stops at the first full stop, comma or "و -"
 * continuation.
 */
export function entryGist(firstGloss: string): string {
  let text = firstGloss.trim();
  const colon = text.indexOf(':');
  const wordsBeforeColon = colon === -1 ? Infinity : text.slice(0, colon).split(/\s+/).length;
  if (colon !== -1 && wordsBeforeColon <= 12) text = text.slice(colon + 1);
  else text = text.replace(/^\([^)]*\)\s*/, '');
  text = text.trim().split(/[.،؛؟]|\sو\s?-\s/)[0];
  return text.trim().split(/\s+/).slice(0, MAX_WORDS).join(' ');
}
