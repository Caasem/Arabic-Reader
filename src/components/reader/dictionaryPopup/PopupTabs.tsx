import { useReorder } from '../../shared/reorder/useReorder';
import '../../shared/reorder/reorder.css';

/**
 * The popup's dictionary switcher (`.dict-popup__tabs`): one tab per dictionary that has an entry. Drag a
 * tab sideways to move that dictionary; `onReorder` gets the tabs' new order.
 */
export function PopupTabs({
  tabs,
  activeId,
  onSelect,
  onReorder,
}: {
  tabs: readonly { id: string; label: string }[];
  activeId: string | undefined;
  onSelect(id: string): void;
  onReorder(ids: string[]): void;
}) {
  const reorder = useReorder({ ids: tabs.map((t) => t.id), onReorder, axis: 'x', immediate: false, keyboard: false });
  return (
    <div ref={reorder.containerRef} className={'dict-popup__tabs ' + reorder.listClass}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          {...reorder.itemProps(t.id)}
          {...reorder.handleProps(t.id)}
          className={
            'dict-popup__tab reorder-handle ' +
            reorder.itemProps(t.id).className +
            (t.id === activeId ? ' dict-popup__tab--active' : '')
          }
          onClick={() => onSelect(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
