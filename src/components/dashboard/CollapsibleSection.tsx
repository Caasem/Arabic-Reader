import { useState, type ReactNode } from 'react';
import { IconChevronLeft } from '../shared/icons';
import './CollapsibleSection.css';

const STORAGE_PREFIX = 'dashboard-section-collapsed:';

/** One show/hide-able card in the Dashboard — every section (Arabic
 * Profile, Current Focus, Reading Statistics, Calendar, Trends) is one of
 * these, so collapse state, styling, and persistence are defined in
 * exactly one place. `id` must be stable and unique — it's the
 * localStorage key suffix. */
export function CollapsibleSection({
  id,
  title,
  subtitle,
  defaultCollapsed = false,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  defaultCollapsed?: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + id);
      return raw === null ? defaultCollapsed : raw === '1';
    } catch {
      return defaultCollapsed;
    }
  });

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_PREFIX + id, next ? '1' : '0');
      } catch {
        // best-effort only
      }
      return next;
    });
  }

  return (
    <section className={'dash-section' + (collapsed ? ' dash-section--collapsed' : '')}>
      <button className="dash-section__header" onClick={toggle} aria-expanded={!collapsed}>
        <div className="dash-section__heading">
          <span className="dash-section__title">{title}</span>
          {subtitle && <span className="dash-section__subtitle">{subtitle}</span>}
        </div>
        <span className="dash-section__chevron" aria-hidden="true">
          <IconChevronLeft size={14} />
        </span>
      </button>
      {!collapsed && <div className="dash-section__body">{children}</div>}
    </section>
  );
}
