import { Fragment } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import { toolTitle, useReaderTools, type ReaderKind } from './tools';

/**
 * The one pill at the bottom of every reader: the tools registered for it (src/readerTools), in their groups.
 * Settings -> Reader -> Dock picks how it looks: Icons (the default) shows every tool as an icon that opens to its
 * name and key under the pointer; Names labels each tool when there is room and scrolls sideways when there isn't.
 * Its look is quietReader.css (.qr-dock); a reader that shows it is a `.qr` root.
 */
export function ReaderDock({
  reader,
  center,
  roomy,
}: {
  reader: ReaderKind;
  /** Horizontal centre inside the reader, px. */
  center: number;
  /** Wide enough for every name (Names only). */
  roomy: boolean;
}) {
  const { prefs } = usePreferences();
  const tools = useReaderTools(reader).filter((t) => !t.noDock);
  const icons = prefs.dockStyle !== 'labels';
  let group = '';
  return (
    <nav className={'qr-dock' + (icons ? ' qr-dock--icons' : '')} aria-label="Reader tools" style={{ left: center }}>
      {tools.map((t, i) => {
        const sep = i > 0 && (t.group !== group || t.cluster);
        group = t.group;
        const on = t.isOn?.();
        const live = t.live?.() ?? null;
        return (
          <Fragment key={t.id}>
            {sep && <span className="qr-dock__sep" aria-hidden="true" />}
            <button
              type="button"
              className={'qr-dock__btn' + (on ? ' qr-dock__btn--on' : '')}
              data-tool={t.id}
              aria-pressed={t.isOn ? !!on : undefined}
              aria-label={t.ariaLabel ?? t.label}
              title={icons ? undefined : toolTitle(t)}
              onClick={() => t.run()}
            >
              {t.icon}
              {icons ? (
                <>
                  <span className="qr-dock__name" aria-hidden="true">
                    {t.label}
                    {t.keys && <kbd>{t.keys}</kbd>}
                  </span>
                  {live && <span className="qr-dock__time qr-dock__live">{live}</span>}
                </>
              ) : (
                (roomy || live) && <span className={live ? 'qr-dock__time' : undefined}>{live ?? t.label}</span>
              )}
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}

/** Where a dock button's centre is, in px from the left of `within` (a sheet opens above it). */
export function dockButtonX(toolId: string, within: HTMLElement | null): number | null {
  const button = document.querySelector<HTMLElement>(`.qr-dock [data-tool="${toolId}"]`);
  if (!button || !within) return null;
  const r = button.getBoundingClientRect();
  return r.left + r.width / 2 - within.getBoundingClientRect().left;
}
