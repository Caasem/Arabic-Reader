import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { tierForRank, TIER_CUTOFFS } from './rarity';

describe('tierForRank', () => {
  it('maps frequency ranks onto learner tiers', () => {
    expect(tierForRank(null)).toBe('unlisted');
    expect(tierForRank(1)).toBe('beginner');
    expect(tierForRank(TIER_CUTOFFS.beginner)).toBe('beginner');
    expect(tierForRank(TIER_CUTOFFS.beginner + 1)).toBe('intermediate');
    expect(tierForRank(TIER_CUTOFFS.intermediate)).toBe('intermediate');
    expect(tierForRank(TIER_CUTOFFS.intermediate + 1)).toBe('advanced');
  });
});
