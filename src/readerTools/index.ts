/**
 * Shared reader tools and Focus (docs/shared-focus-changes.md): one tool list for the dock (the reader's and the PDF pages')
 * and the Focus rail, and one Focus for the quiet reader and the PDF pages.
 */
export { FocusHost } from './FocusHost';
export { ReaderDock, dockButtonX } from './Dock';
export { useReadTools, readToolId, READ_TOOLS, type ReadToolId } from './readTools';
export { registerReaderTool, refreshReaderTools, useReaderTools, toolTitle, type ReaderTool, type ReaderKind } from './tools';
export { readerFocus, setReaderFocus, setFocusWhere, useReaderFocus } from './focus';
