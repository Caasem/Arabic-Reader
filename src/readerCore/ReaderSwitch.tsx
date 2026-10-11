import { lazy } from 'react';
import type { BookMeta } from '../types';
import { DictionarySearchHost } from '../dictionarySearch';
import { BookSearchHost } from '../bookSearch';
import { BookVocabHost } from '../bookVocab';
import { NoteHost } from '../noteCard';
import { FlashHost } from '../flashCard';
import { PicksExportHost } from '../picksExport';
import { DeskHost } from '../studyDesk';
import { AnnotateHost } from '../annotate';
import { FocusHost } from '../readerTools';
import { usePdfView } from '../pdf/pages/pdfView';

const PdfPagesReader = lazy(() => import('../pdf/pagesEntry').then((m) => ({ default: m.PdfPagesReader })));
const QuietReader = lazy(() => import('../quietReader/QuietReader').then((m) => ({ default: m.QuietReader })));

interface ReaderSwitchProps {
  book: BookMeta;
  onBack(): void;
  /** The margin's vocab levels, driven by the "Vocab Levels" nav tab. */
  vocabPanelOpen?: boolean;
  onVocabPanelOpenChange?(open: boolean): void;
  /** Opens at this place (a "clean:" location or, from before 0.96.0, an epub CFI) instead of the saved one. */
  initialCfiOverride?: string;
  /** Switches the open book -- for library search results in another book. */
  onOpenBookAt?(book: BookMeta, cfi?: string): void;
  /** Focus went idle: the app-level sidebar should hide too. */
  onFocusChromeChange?(hidden: boolean): void;
  /** Opens Settings, at a group when given (the new reader's settings links). */
  onOpenSettings?(group?: string): void;
}

/**
 * The single place that chooses which reader shows a book: the new reader (src/quietReader), or, for a book added
 * from a PDF, its own pages when Display -> PDF says so. Since 0.96.0 there is no other reader: Original layout and
 * the old clean reader went in refactor phase 2b (docs/changes/refactor-changes.md, "Which readers stay").
 */
export function ReaderSwitch({ onFocusChromeChange, onOpenSettings, ...props }: ReaderSwitchProps) {
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
      <DeskHost book={props.book} onOpenBook={props.onOpenBookAt} />
      <AnnotateHost book={props.book} />
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
          onOpenSettings={onOpenSettings}
          initialLocation={props.initialCfiOverride}
          onOpenBookAt={props.onOpenBookAt}
          levelsOpen={props.vocabPanelOpen}
          onLevelsOpenChange={props.onVocabPanelOpenChange}
        />
        {hosts}
        <FocusHost reader="pdf" onChromeHidden={onFocusChromeChange} />
      </>
    );
  }

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
        onShowPages={props.book.pdf ? () => setPdfView('pages') : undefined}
      />
      {hosts}
      <FocusHost reader="clean" />
    </>
  );
}
