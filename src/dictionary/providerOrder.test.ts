import { describe, expect, it } from 'vitest';
import { moveProviderId, orderProviders } from './providerOrder';

const ps = [{ id: 'aramorph' }, { id: 'alwasit' }, { id: 'custom' }];

describe('orderProviders', () => {
  it('keeps registration order when nothing is chosen', () => {
    expect(orderProviders(ps, []).map((p) => p.id)).toEqual(['aramorph', 'alwasit', 'custom']);
  });
  it('puts chosen ids first, then the rest in registration order', () => {
    expect(orderProviders(ps, ['custom', 'alwasit']).map((p) => p.id)).toEqual(['custom', 'alwasit', 'aramorph']);
  });
  it('ignores ids that are no longer registered', () => {
    expect(orderProviders(ps, ['gone', 'alwasit']).map((p) => p.id)).toEqual(['alwasit', 'aramorph', 'custom']);
  });
});

describe('moveProviderId', () => {
  it('swaps with the neighbour', () => {
    expect(moveProviderId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveProviderId(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });
  it('does nothing at the ends or for an unknown id', () => {
    expect(moveProviderId(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
    expect(moveProviderId(['a', 'b'], 'b', 1)).toEqual(['a', 'b']);
    expect(moveProviderId(['a', 'b'], 'z', 1)).toEqual(['a', 'b']);
  });
});
