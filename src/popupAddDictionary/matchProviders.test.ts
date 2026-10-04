import { describe, expect, it } from 'vitest';
import { matchOffProviders } from './matchProviders';

const ps = [
  { id: 'aramorph', name: 'AraMorph' },
  { id: 'alwasit', name: 'Al-Muʿjam al-Wasīṭ' },
  { id: 'alsihah', name: 'Al-Ṣiḥāḥ' },
  { id: 'almaqayis', name: 'Maqāyīs al-Lugha' },
];

describe('matchOffProviders', () => {
  it('lists only the dictionaries that are off, in order', () => {
    expect(matchOffProviders(ps, ['aramorph'], '').map((p) => p.id)).toEqual(['alwasit', 'alsihah', 'almaqayis']);
  });
  it('filters by name, ignoring case and surrounding spaces', () => {
    expect(matchOffProviders(ps, ['aramorph'], '  MAQ ').map((p) => p.id)).toEqual(['almaqayis']);
  });
  it('never offers one that is already on', () => {
    expect(matchOffProviders(ps, ['aramorph'], 'aramorph')).toEqual([]);
  });
});
