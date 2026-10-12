import type { ReactNode } from 'react';
import { ReorderGrip } from '../reorder/ReorderGrip';
import { useReorder } from '../reorder/useReorder';

/**
 * The dictionaries, one row each: a grip to drag it into place, an on/off switch and its name. Used by
 * Settings -> Dictionaries and by the popup's own settings sheet, so both order and switch them the same way.
 */
export function ProviderOrderList({
  providers,
  enabledIds,
  onToggle,
  onReorder,
  extra,
}: {
  /** In the order they are shown (Settings' order). */
  providers: readonly { id: string; name: string }[];
  enabledIds: readonly string[];
  onToggle(id: string, on: boolean): void;
  onReorder(ids: string[]): void;
  /** Trailing content for a row (a status badge). */
  extra?(id: string): ReactNode;
}) {
  const ids = providers.map((p) => p.id);
  const reorder = useReorder({ ids, onReorder });
  return (
    <div ref={reorder.containerRef} className={reorder.listClass}>
      {providers.map((p, idx) => (
        <div {...reorder.itemProps(p.id)} className={'settings-row settings-row--dict ' + reorder.itemProps(p.id).className} key={p.id}>
          <ReorderGrip name={p.name} index={idx} count={providers.length} {...reorder.handleProps(p.id)} />
          <label className="settings-toggle">
            <input type="checkbox" checked={enabledIds.includes(p.id)} onChange={(e) => onToggle(p.id, e.target.checked)} />
            <span className="settings-toggle__label">{p.name}</span>
          </label>
          {extra?.(p.id)}
        </div>
      ))}
    </div>
  );
}
