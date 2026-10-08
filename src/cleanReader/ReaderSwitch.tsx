import { lazy, type ComponentProps } from 'react';
import { Reader } from '../components/reader/Reader';
import { usePreferences } from '../state/PreferencesContext';
import { DictionarySearchHost } from '../dictionarySearch';
import { BookSearchHost } from '../bookSearch';
import { BookVocabHost } from '../bookVocab';
import { NoteHost } from '../noteCard';
import { FlashHost } from '../flashCard';
import { PicksExportHost } from '../picksExport';
import { DeskHost } from '../studyDesk';
import { useReaderView } from '../quietReader/readerView';
import { saveCleanFocus } from './cleanFocus';
import { usePdfView } from '../pdf/pages/pdfView';

const CleanReader = lazy(() => import('./CleanReader').then((m) => ({ default: m.CleanReader })));
const PdfPagesReader = lazy(() => import('../pdf/pagesEntry').then((m) => ({ default: m.PdfPagesReader })));
const QuietReader = lazy(() => import('../quietReader/QuietReader').then((m) => ({ default: m.QuietReader })));

type ReaderSwitchProps = ComponentProps<typeof Reader> & {
  /** Clean Reader's Focus went idle: the app-level sidebar should hide too. */
  onFocusChromeChange?(hidden: boolean): void;
  /** Opens Settings, at a group when given (the new reader's settings links). */
  onOpenSettings?(group?: string): void;
};

/**
 * The single place that chooses which reader shows a book. With "New reader"
 * on (src/quietReader), books open in it unless one was switched to its
 * original layout under Display -> View. Off, the clean text reader or the epub
 * reader shows, as before. To remove the clean reader entirely: put <Reader>
 * back in App.tsx, delete this folder, and drop the `cleanReaderEnabled`
 * preference and its settings row (CleanReaderSettings).
 */
export function ReaderSwitch({ onFocusChromeChange, onOpenSettings, ...props }: ReaderSwitchProps) {
  const { prefs } = usePreferences();
  const [view, setView] = useReaderView(props.book.id);
  const [pdfView, setPdfView] = usePdfView(props.book);

  // Alt+D, Alt+S, Alt+V, Alt+N, Alt+F and Alt+P open their palettes and cards over whichever reader is showing.
  const hosts = (
    <>
      <DictionarySearchHost book={props.book} />
      <BookSearchHost book={props.book} />
      <BookVocabHost book={props.book} />
      <NoteHost />
      <FlashHost book={props.book} />
      <PicksExportHost book={props.book} />
      <DeskHost book={props.book} />
    </>
  );

  // A book added from a PDF can be read as its own pages (the only way when its text could not be reflowed).
  if (props.book.pdf && pdfView === 'pages') {
    return (
      <>
        <PdfPagesReader
          book={props.book}
          onBack={props.onBack}
          onShowText={props.book.pdf.reflow === 'ok' ? () => setPdfView('text') : undefined}
        />
        {hosts}
      </>
    );
  }

  if (prefs.quietReaderEnabled && view === 'clean') {
    return (
      <>
        <QuietReader
          book={props.book}
          onBack={props.onBack}
          onFocusChromeChange={onFocusChromeChange}
          initialLocation={props.initialCfiOverride}
          onOpenBookAt={props.onOpenBookAt}
          levelsOpen={props.vocabPanelOpen}
          onLevelsOpenChange={props.onVocabPanelOpenChange}
          onOpenSettings={onOpenSettings}
          onShowOriginal={() => setView('original')}
          onShowPages={props.book.pdf ? () => setPdfView('pages') : undefined}
        />
        {hosts}
      </>
    );
  }

  const backToClean = prefs.quietReaderEnabled
    ? {
        onSwitchToCleanReader: () => setView('clean'),
        onEnterCleanFocus: () => {
          saveCleanFocus(true);
          setView('clean');
        },
      }
    : {};

  return (
    <>
      {prefs.cleanReaderEnabled && !prefs.quietReaderEnabled ? (
        <CleanReader book={props.book} onBack={props.onBack} onFocusChromeChange={onFocusChromeChange} />
      ) : (
        <Reader {...props} {...backToClean} />
      )}
      {hosts}
    </>
  );
}
