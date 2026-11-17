import { getWindowsBridge } from '../sync/desktopBridge';
import { useOpenWindows } from './useOpenWindows';

/** "Open now": the books in other windows, at the top of the Library. Clicking one brings its window forward. */
export function OpenNow() {
  const open = useOpenWindows().filter((w) => w.kind === 'light' && w.bookId);
  if (open.length === 0) return null;
  return (
    <section className="oip-now" aria-label="Open now">
      <h2 className="oip-now__title">Open now</h2>
      <ul className="oip-now__list">
        {open.map((w) => (
          <li key={w.id}>
            <button type="button" className="oip-now__item" onClick={() => void getWindowsBridge()?.focus(w.id)} dir="auto">
              {w.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
