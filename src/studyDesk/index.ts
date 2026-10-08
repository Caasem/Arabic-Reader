/**
 * The study desk (docs/features/study-desk.md). Self-contained: the app touches this folder through
 * <DeskHost> in ReaderSwitch, <StudyDeskSettings> in SettingsPanel, the `studyDesk*` preferences, and its
 * database in the storage registry and the full export. Every change is listed in docs/study-desk-changes.md.
 */
export { DeskHost } from './DeskHost';
export { StudyDeskSettings } from './StudyDeskSettings';
