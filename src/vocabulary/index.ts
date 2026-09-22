export * from './vocabularyService';

// `lookupWord` is intentionally NOT re-exported here: it composes across the
// vocabulary AND dictionary domains (and importing it eagerly instantiates
// the dictionary provider's worker), so it doesn't belong on this module's
// public interface. Import it directly from './lookupWord'.
