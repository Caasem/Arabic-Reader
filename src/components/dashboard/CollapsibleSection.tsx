import { useState, type ReactNode } from 'react';
import { IconChevronLeft } from '../shared/icons';
import { readString, STORAGE_KEYS, writeString } from '../../utils/storage';
import './CollapsibleSection.css';

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
  const storageKey = STORAGE_KEYS.dashboardSectionCollapsedPrefix + id;
  const [collapsed, setCollapsed] = useState(() => {
    const raw = readString(storageKey);
    return raw === null ? defaultCollapsed : raw === '1';
  });

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    writeString(storageKey, next ? '1' : '0');
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
