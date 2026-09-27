/** A single timed line of a clip's transcript. */
export interface ClipTranscriptSegment {
  startSec: number;
  text: string;
}

/**
 * A short YouTube clip plus its transcript -- the unit a lesson is built
 * from. `startSec`/`endSec` scope playback to the clip within a (possibly
 * longer) source video.
 */
export interface Clip {
  id: string;
  title: string;
  videoId: string;
  startSec: number;
  endSec: number;
  transcript: ClipTranscriptSegment[];
  /** Attribution for the channel/curator the clip was sourced from. */
  source?: string;
}

/** One pre-teach/recap flashcard: a word from the clip plus its dictionary
 * meaning, resolved once when the lesson is built. */
export interface ClipVocabCard {
  surfaceForm: string;
  normalizedForm: string;
  meaning: string;
  root?: string;
}
