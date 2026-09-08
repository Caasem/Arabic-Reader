import './NavBar.css';

export type ViewName = 'library' | 'read' | 'vocabLevels' | 'vocabulary' | 'highlights' | 'review' | 'speedReader';

// 'vocabLevels' (per-book "Vocabulary Levels" — rarity-tiered word list with
// jump-to-occurrence) is distinct from 'vocabulary' (the cross-book saved
// Vocabulary tab that already existed) — both need their own nav entries
// since they show different things.
const ITEMS: { id: ViewName; label: string; icon: string }[] = [
  { id: 'library', label: 'Library', icon: '📚' },
  { id: 'read', label: 'Read', icon: '📖' },
  { id: 'speedReader', label: 'Speed Reader', icon: '⚡' },
  { id: 'vocabLevels', label: 'Vocab Levels', icon: '📊' },
  { id: 'vocabulary', label: 'Vocabulary', icon: '🔤' },
  { id: 'highlights', label: 'Highlights', icon: '✎' },
  { id: 'review', label: 'Review', icon: '◐' },
];

// Views that only make sense with a book open — disabled in the nav bar
// until one is.
const REQUIRES_BOOK: ViewName[] = ['read', 'vocabLevels'];

export function NavBar({
  active,
  onSelect,
  readDisabled,
  onOpenSettings,
}: {
  active: ViewName;
  onSelect: (v: ViewName) => void;
  readDisabled?: boolean;
  onOpenSettings: () => void;
}) {
  return (
    <nav className="navbar">
      <div className="navbar__brand">
        <span className="navbar__mark">ق</span>
        <span className="navbar__title">Reader</span>
        <button className="navbar__settings" onClick={onOpenSettings} aria-label="Settings" title="Settings">
          ⚙
        </button>
      </div>
      <ul className="navbar__list">
        {ITEMS.map((item) => (
          <li key={item.id}>
            <button
              className={
                'navbar__item' +
                (active === item.id ? ' navbar__item--active' : '') +
                (REQUIRES_BOOK.includes(item.id) && readDisabled ? ' navbar__item--disabled' : '')
              }
              disabled={REQUIRES_BOOK.includes(item.id) && readDisabled}
              onClick={() => onSelect(item.id)}
            >
              <span className="navbar__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="navbar__label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
