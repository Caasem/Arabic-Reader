/**
 * Ink and sketches (docs/features/annotate.md). Self-contained: the app touches this folder through
 * <AnnotateHost> in ReaderSwitch, <AnnotateSettings> in SettingsPanel, the `annotateEnabled` preference, and
 * its database in the storage registry and the full export. Every change is listed in docs/annotate-changes.md.
 */
export { AnnotateHost } from './AnnotateHost';
export { AnnotateSettings } from './AnnotateSettings';
