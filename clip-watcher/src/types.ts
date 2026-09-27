/** One vocabulary word taught for a clip. `surfaceForm` must match the
 * word exactly as it appears in the transcript text, so the transcript
 * view can highlight it without needing a morphology engine. */
export interface ClipVocabWord {
  surfaceForm: string;
  meaning: string;
  root?: string;
}

export interface ClipTranscriptSegment {
  startSec: number;
  text: string;
}

export interface Clip {
  id: string;
  title: string;
  videoId: string;
  startSec: number;
  endSec: number;
  source?: string;
  /** The curated pre-teach/recap set. */
  vocab: ClipVocabWord[];
  /** Every other word in the transcript worth defining on hover/tap --
   * lets the transcript act as a lookup surface beyond the curated set. */
  glossary: ClipVocabWord[];
  transcript: ClipTranscriptSegment[];
}
