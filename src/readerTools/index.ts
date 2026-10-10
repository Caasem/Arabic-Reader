/**
 * Shared reader tools and Focus (docs/shared-focus-changes.md): one tool list for the dock, the PDF top bar
 * and the Focus rail, and one Focus for the quiet reader and the PDF pages.
 */
export { FocusHost, DockTools } from './FocusHost';
export { registerReaderTool, refreshReaderTools, useReaderTools, type ReaderTool, type ReaderKind } from './tools';
export { readerFocus, setReaderFocus, setFocusWhere, useReaderFocus } from './focus';
