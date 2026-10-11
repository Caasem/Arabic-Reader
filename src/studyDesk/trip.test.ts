import { describe, expect, it } from 'vitest';
import type { BookMeta } from '../types';
import { againTrip, countTripCapture, currentTrip, endTrip, lastTripFrom, startTrip, takeTripNote, takeTripReopen, tripDoneMessage, tripFiledMessage, tripPlacement, tripStayMessage } from './trip';

const from = { id: 'a', title: 'Muqaddima' } as BookMeta;
const to = { id: 'b', title: 'Tahafut' } as BookMeta;

describe('capture trips', () => {
  it('files a margin capture at the page left behind', () => {
    const t = { from, to, deskId: 'book:a', target: 'left' as const, spot: { bookId: 'a', location: 'clean:3:40:40' } };
    expect(tripPlacement(t)).toEqual({ inInbox: false, pin: { bookId: 'a', location: 'clean:3:40:40', side: 'left' } });
    expect(tripFiledMessage(t)).toBe('Captured from Tahafut, filed in the left Ḥāshiya');
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
    expect(takeTripReopen('a')).toBeNull();
  });

  it('opens the desk document again on return when the trip started there, at the item captured', () => {
    startTrip({ from, to, deskId: 'own:1', target: 'inbox', spot: null, fromDocument: 'own:1' });
    endTrip('Captured', 'di_9');
    expect(takeTripReopen('b')).toBeNull();
    expect(takeTripReopen('a')).toEqual({ deskId: 'own:1', itemId: 'di_9' });
    expect(takeTripReopen('a')).toBeNull();
  });
});

describe('capture and stay', () => {
  it('counts each capture, keeps the trip open, and says the total on Done', () => {
    startTrip({ from, to, deskId: 'book:a', target: 'right', spot: { bookId: 'a', location: 'clean:3:40:40' } });
    expect(currentTrip()?.captured).toBe(0);
    countTripCapture('di_1');
    const t = countTripCapture('di_2');
    expect(currentTrip()).toBe(t);
    expect(t?.captured).toBe(2);
    expect(t?.lastItemId).toBe('di_2');
    expect(tripStayMessage(t!)).toBe('Filed in the right Ḥāshiya (2 so far). Capture more, or Done to go back');
    expect(tripDoneMessage(t!)).toBe('Captured 2 things from Tahafut, filed in the right Ḥāshiya');
    endTrip(tripDoneMessage(t!), t!.lastItemId);
    expect(currentTrip()).toBeNull();
  });

  it('says nothing was captured when Done comes before any capture', () => {
    startTrip({ from, to, deskId: 'book:a', target: 'inbox', spot: null });
    expect(tripDoneMessage(currentTrip()!)).toBe('Back where you were, nothing captured');
    endTrip();
  });

  it('a failed capture leaves the trip open and the count as it was', () => {
    startTrip({ from, to, deskId: 'book:a', target: 'inbox', spot: null });
    countTripCapture('di_1');
    // RegionCapture never calls onSent when saving throws, so nothing else is counted or ended.
    expect(currentTrip()?.captured).toBe(1);
    expect(tripDoneMessage(currentTrip()!)).toBe('Captured from Tahafut, filed in the inbox');
    endTrip();
  });

  it('starts every trip at nought, even after a counted one', () => {
    startTrip({ from, to, deskId: 'book:a', target: 'inbox', spot: null });
    countTripCapture('di_1');
    endTrip();
    startTrip({ from, to, deskId: 'book:a', target: 'inbox', spot: null });
    expect(currentTrip()?.captured).toBe(0);
    expect(currentTrip()?.lastItemId).toBeUndefined();
    endTrip();
  });

  it('does nothing without a trip', () => {
    expect(countTripCapture('di_1')).toBeNull();
  });
});

describe('back to the last book', () => {
  const spot = { bookId: 'a', location: 'clean:3:40:40' };

  it('remembers the last trip for the book it started from only', () => {
    startTrip({ from, to, deskId: 'book:a', target: 'left', spot });
    countTripCapture('di_1');
    endTrip();
    expect(lastTripFrom('b')).toBeNull();
    expect(lastTripFrom('a')?.to.id).toBe('b');
  });

  it('goes again with the same book, target, spot and desk, and no captures yet', () => {
    startTrip({ from, to, deskId: 'own:1', target: 'left', spot, fromDocument: 'own:1' });
    countTripCapture('di_1');
    endTrip();
    const again = againTrip(lastTripFrom('a')!, false);
    expect(again).toEqual({ from, to, deskId: 'own:1', target: 'left', spot, fromDocument: undefined });
    expect(againTrip(lastTripFrom('a')!, true).fromDocument).toBe('own:1');
    startTrip(again);
    expect(currentTrip()?.captured).toBe(0);
    expect(tripPlacement(currentTrip()!)).toEqual({ inInbox: false, pin: { ...spot, side: 'left' } });
    endTrip();
  });

  it('is replaced by the next trip started', () => {
    const other = { id: 'c', title: 'Ihya' } as BookMeta;
    startTrip({ from, to, deskId: 'book:a', target: 'inbox', spot: null });
    endTrip();
    startTrip({ from, to: other, deskId: 'book:a', target: 'right', spot });
    endTrip();
    expect(lastTripFrom('a')?.to.title).toBe('Ihya');
    expect(lastTripFrom('a')?.target).toBe('right');
  });
});
