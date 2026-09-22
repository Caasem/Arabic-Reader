import type { TocItem } from '../../types';

export function TocPanel({ items, onSelect }: { items: TocItem[]; onSelect(href: string): void }) {
  return (
    <aside className="reader__toc">
      <TocList items={items} onSelect={onSelect} />
    </aside>
  );
}

function TocList({ items, onSelect }: { items: TocItem[]; onSelect(href: string): void }) {
  return (
    <ul className="toc-list">
      {items.map((item) => (
        <li key={item.href}>
          <button className="toc-list__item" onClick={() => onSelect(item.href)}>
            {item.label}
          </button>
          {item.subitems && <TocList items={item.subitems} onSelect={onSelect} />}
        </li>
      ))}
    </ul>
  );
}
