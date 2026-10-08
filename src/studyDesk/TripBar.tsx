import type { DeskTrip } from './trip';

/** The bar across the top of the other book during a capture trip: what is happening and the way back. */
export function TripBar({ trip, onCapture, onCancel }: { trip: DeskTrip; onCapture(): void; onCancel(): void }) {
  const where = trip.target === 'inbox' || !trip.spot ? 'the inbox' : `your ${trip.target} margin`;
  return (
    <div className="sd-trip" role="region" aria-label="Capture trip">
      <div className="sd-trip__text">
        <b>Capturing for {trip.from.title}</b>
        <span>
          Find what you want in <i dir="auto">{trip.to.title}</i>, then capture it. It goes to {where} and you go straight back.
        </span>
      </div>
      <div className="sd-trip__acts">
        <button type="button" className="sd-btn sd-btn--pri" onClick={onCapture}>
          Capture <kbd>Alt X</kbd>
        </button>
        <button type="button" className="sd-btn" onClick={onCancel}>
          Cancel and return <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
}
