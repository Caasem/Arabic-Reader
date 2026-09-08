import { useEffect, useState, type ReactElement } from 'react';
import {
  IconLibrary,
  IconRead,
  IconSpeedReader,
  IconVocabLevels,
  IconVocabulary,
  IconHighlights,
  IconReview,
  IconDashboard,
  IconSettings,
  IconChevronLeft,
  IconChevronRight,
} from './icons';
import './NavBar.css';

export type ViewName =
  | 'library'
  | 'read'
  | 'vocabLevels'
  | 'vocabulary'
  | 'highlights'
  | 'review'
  | 'speedReader'
  | 'dashboard';

const NAVBAR_COLLAPSED_KEY = 'navbar-collapsed';

// 'vocabLevels' (per-book "Vocabulary Levels" — rarity-tiered word list with
// jump-to-occurrence) is distinct from 'vocabulary' (the cross-book saved
// Vocabulary tab that already existed) — both need their own nav entries
// since they show different things.
const ITEMS: { id: ViewName; label: string; Icon: (props: { size?: number }) => ReactElement }[] = [
  { id: 'library', label: 'Library', Icon: IconLibrary },
  { id: 'read', label: 'Read', Icon: IconRead },
  { id: 'speedReader', label: 'Speed Reader', Icon: IconSpeedReader },
  { id: 'vocabLevels', label: 'Vocab Levels', Icon: IconVocabLevels },
  { id: 'vocabulary', label: 'Vocabulary', Icon: IconVocabulary },
  { id: 'highlights', label: 'Highlights', Icon: IconHighlights },
  { id: 'review', label: 'Review', Icon: IconReview },
  { id: 'dashboard', label: 'Dashboard', Icon: IconDashboard },
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
  // Collapsed = a 76px icon-only rail (mirrors the Smart Structure concept's
  // rail), persisted across sessions so the choice sticks.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(NAVBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(NAVBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // localStorage unavailable (private mode, etc.) — collapse state just
      // won't persist across reloads, which is fine.
    }
  }, [collapsed]);

  return (
    <nav className={'navbar' + (collapsed ? ' navbar--collapsed' : '')}>
      <div className="navbar__brand">
        <span className="navbar__mark">ق</span>
        {!collapsed && <span className="navbar__title">Reader</span>}
        {!collapsed && (
          <button className="navbar__settings" onClick={onOpenSettings} aria-label="Settings" title="Settings">
            <IconSettings size={16} />
          </button>
        )}
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
              title={collapsed ? item.label : undefined}
            >
              <span className="navbar__icon" aria-hidden="true">
                <item.Icon size={18} />
              </span>
              {!collapsed && <span className="navbar__label">{item.label}</span>}
            </button>
          </li>
        ))}
      </ul>

      {collapsed && (
        <button className="navbar__settings navbar__settings--collapsed" onClick={onOpenSettings} aria-label="Settings" title="Settings">
          <IconSettings size={16} />
        </button>
      )}

      <button
        className="navbar__collapse-toggle"
        onClick={() => setCollapsed((v) => !v)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? <IconChevronRight size={14} /> : <IconChevronLeft size={14} />}
      </button>
    </nav>
  );
}
