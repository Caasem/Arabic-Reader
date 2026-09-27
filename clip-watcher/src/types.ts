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
  vocab: ClipVocabWord[];
  transcript: ClipTranscriptSegment[];
}
