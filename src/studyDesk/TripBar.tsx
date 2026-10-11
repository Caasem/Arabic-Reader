import type { DeskTrip } from './trip';

/** The bar across the top of the other book during a capture trip: what is happening and the way back. */
export function TripBar({ trip, onCapture, onCaptureStay, onCancel }: { trip: DeskTrip; onCapture(): void; onCaptureStay(): void; onCancel(): void }) {
  const where = trip.target === 'inbox' || !trip.spot ? 'the inbox' : `your ${trip.target} Ḥāshiya`;
  const n = trip.captured ?? 0;
  return (
    <div className="sd-trip" role="region" aria-label="Capture trip">
      <div className="sd-trip__text">
        <b>
          Capturing for {trip.from.title}
          {n > 0 && <span className="sd-trip__count" aria-live="polite">{n} filed</span>}
        </b>
        <span>
          Find what you want in <i dir="auto">{trip.to.title}</i>, then capture it. It goes to {where}. Capture takes you straight back; Capture and stay lets you take more.
        </span>
      </div>
      <div className="sd-trip__acts">
        <button type="button" className="sd-btn sd-btn--pri" onClick={onCapture}>
          Capture <kbd>Alt X</kbd>
        </button>
        <button type="button" className="sd-btn" onClick={onCaptureStay}>
          Capture and stay <kbd>Shift Alt X</kbd>
        </button>
        <button type="button" className="sd-btn" onClick={onCancel}>
          {n > 0 ? 'Done, go back' : 'Cancel and return'} <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
}
