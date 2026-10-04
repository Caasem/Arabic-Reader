/**
 * The Arabic-Arabic dictionaries whose entries the popup renders word by word
 * (select-and-save, and the wasitMatch highlight) instead of as a plain list:
 * the ones filed by root, whose long articles are worth picking words out of.
 */
const TOKENIZED_PROVIDER_IDS = new Set(['alwasit', 'alsihah', 'almaqayis']);

export const isTokenizedProvider = (providerId: string): boolean => TOKENIZED_PROVIDER_IDS.has(providerId);
