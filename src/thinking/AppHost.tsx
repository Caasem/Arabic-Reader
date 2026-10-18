import { movesOn } from './switches';
import { lazy, Suspense, useEffect, useRef } from 'react';
import type { AppHostProps } from '../features/registry';
import { usePreferences } from '../state/PreferencesContext';
import { getDesk, joinThread, onDeskChange, onItemAdded } from '../studyDesk/deskStore';
import { ClosingSheet } from './ClosingSheet';
import { registerThinkingExports } from './exportFormats';
import { closeScreen, setThinking, thinkingState, useThinking } from './state';
import { joinsActiveThread } from './threads';
import { ThinkingToast } from './toast';
import './thinking.css';

const ThreadScreen = lazy(() => import('./screens/ThreadScreen').then((m) => ({ default: m.ThreadScreen })));
const MasailScreen = lazy(() => import('./screens/MasailScreen').then((m) => ({ default: m.MasailScreen })));
const RevisitScreen = lazy(() => import('./screens/RevisitScreen').then((m) => ({ default: m.RevisitScreen })));

/**
 * The thinking desk across the whole app: new things join the active thread wherever they are made, the screens
 * (Thread, and the parts that add theirs) open over the app, and the one toast shows.
 */
export function AppHost({ onOpenBook }: AppHostProps) {
  const { prefs } = usePreferences();
  const { screen } = useThinking();
  const prefsRef = useRef(prefs);
  useEffect(() => void (prefsRef.current = prefs));

  // While a thread is active, new thoughts, masāʾil and moves join it, from the passage bar, the Ḥāshiya or the desk.
  useEffect(
    () =>
      onItemAdded((item) => {
        const active = thinkingState().active;
        if (active && prefsRef.current.thinkingThreads && joinsActiveThread(item)) void joinThread([item.id], active);
      }),
    []
  );

  // The active thread is archived or deleted (here, in All desks or on another device's import): stop collecting.
  useEffect(() => {
    const check = () => {
      const id = thinkingState().active;
      if (id) void getDesk(id).then((d) => thinkingState().active === id && (!d || d.archivedAt) && setThinking({ active: null }));
    };
    check();
    return onDeskChange(check);
  }, []);

  // A quote tagged with a move shows its Arabic label in the desk document (thinking.css), while the moves are on.
  useEffect(() => {
    document.documentElement.classList.toggle('th-doc-moves', movesOn({ thinkingMoves: prefs.thinkingMoves, argumentsEnabled: prefs.argumentsEnabled }));
    return () => document.documentElement.classList.remove('th-doc-moves');
  }, [prefs.thinkingMoves, prefs.argumentsEnabled]);

  // Obsidian and Notion join the desk document's Export menu, for a thread's document and a book desk's alike.
  useEffect(() => (prefs.thinkingExport ? registerThinkingExports() : undefined), [prefs.thinkingExport]);

  // Esc closes a screen, unless something inside it (a menu, a note being typed) takes it first.
  useEffect(() => {
    if (!screen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('.sd-export__menu, .sd-zoom, .sd-picker')) return;
      closeScreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen]);

  return (
    <>
      {screen && (
        <Suspense fallback={<div className="th-screen th-screen--loading" role="status">Loading…</div>}>
          {screen.kind === 'thread' && prefs.thinkingThreads && <ThreadScreen screen={screen} onOpenBook={onOpenBook} />}
          {screen.kind === 'masail' && prefs.thinkingMasail && <MasailScreen onOpenBook={onOpenBook} />}
          {screen.kind === 'revisit' && prefs.thinkingRevisit && <RevisitScreen screen={screen} onOpenBook={onOpenBook} />}
        </Suspense>
      )}
      <ThinkingToast />
      <ClosingSheet />
    </>
  );
}
