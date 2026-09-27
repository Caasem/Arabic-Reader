import type { Clip } from './types';

/**
 * Hand-picked prototype clip: real timed transcript, scraped from YouTube's
 * own (auto-generated) caption track for the video -- the same text the
 * burned-in subtitles on screen show. Stand-in for a future ingestion
 * pipeline; see extractClipVocab.ts for what's built on top of it.
 */
export const SAMPLE_CLIPS: Clip[] = [
  {
    id: 'where-is-allah',
    title: 'أين الله؟',
    videoId: '0qef-7YrSw4',
    startSec: 0,
    endSec: 33,
    source: '"جنتان" للمقاطع المؤثرة — الشيخ سعيد الكملي',
    transcript: [
      { startSec: 0, text: 'آمنتم من في السماء أي من في العلو ربنا سبحانه في العلو لأنه العلو علي' },
      { startSec: 8, text: 'خلقه سبحانه إليه يصعد الكلام الطيب أتي رافعك' },
      { startSec: 16, text: 'إليه تعرج الملائكة والروح تعرج أي تصعد فربنا سبحانه في' },
      { startSec: 23, text: 'العلو لأنه مستوٍ سبحانه فوق عرشه وعرشه فوق السماوات فهو سبحانه في العلو آمنتم' },
      { startSec: 30, text: 'في السماء أي في العلو' },
    ],
  },
];
