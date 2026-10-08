import { describe, expect, it } from 'vitest';
import type { BookMeta } from '../types';
import { currentTrip, endTrip, startTrip, takeTripNote, tripFiledMessage, tripPlacement } from './trip';

const from = { id: 'a', title: 'Muqaddima' } as BookMeta;
const to = { id: 'b', title: 'Tahafut' } as BookMeta;

describe('capture trips', () => {
  it('files a margin capture at the page left behind', () => {
    const t = { from, to, deskId: 'book:a', target: 'left' as const, spot: { bookId: 'a', location: 'clean:3:40:40' } };
    expect(tripPlacement(t)).toEqual({ inInbox: false, pin: { bookId: 'a', location: 'clean:3:40:40', side: 'left' } });
    expect(tripFiledMessage(t)).toBe('Captured from Tahafut, filed in the left margin');
  });

  it('goes to the inbox when there was no page to place on', () => {
    const t = { from, to, deskId: 'book:a', target: 'right' as const, spot: null };
    expect(tripPlacement(t)).toEqual({ inInbox: true });
    expect(tripFiledMessage(t)).toContain('the inbox');
  });

  it('ends once and leaves its message for the page it returns to, once', () => {
    startTrip({ from, to, deskId: 'book:a', target: 'inbox', spot: null });
    expect(currentTrip()?.to.id).toBe('b');
    expect(endTrip('Back')?.from.id).toBe('a');
    expect(currentTrip()).toBeNull();
    expect(takeTripNote()).toBe('Back');
    expect(takeTripNote()).toBeNull();
  });
});
