import type { Clip } from './types';

/**
 * Hand-picked prototype clip. Transcript text is the real timed transcript
 * scraped from YouTube's own caption track (matches the burned-in subtitles
 * on screen). Vocab meanings are copied from a real dictionary lookup done
 * against Arabic Reader's AraMorph data during prototyping -- standing in
 * for the lookup this module would eventually call over an API/props once
 * integrated, rather than depending on that app's dictionary engine here.
 */
export const SAMPLE_CLIPS: Clip[] = [
  {
    id: 'where-is-allah',
    title: 'أين الله؟',
    videoId: '0qef-7YrSw4',
    startSec: 0,
    endSec: 33,
    source: '"جنتان" للمقاطع المؤثرة — الشيخ سعيد الكملي',
    vocab: [
      { surfaceForm: 'آمنتم', meaning: 'believe [you (masc. pl.)] <verb>' },
      { surfaceForm: 'السماء', meaning: '[the] sky, heaven' },
      { surfaceForm: 'العلو', meaning: '[the] height, elevation' },
      { surfaceForm: 'ربنا', meaning: 'lord, master [our]; owner, proprietor [our]' },
      { surfaceForm: 'سبحانه', meaning: 'praise [his/its]' },
      { surfaceForm: 'علي', meaning: 'on, above [me]' },
      { surfaceForm: 'خلقه', meaning: 'create, shape, mold [he/it <verb> it/him]' },
      { surfaceForm: 'إليه', meaning: 'to, towards [it/him]' },
    ],
    transcript: [
      { startSec: 0, text: 'آمنتم من في السماء أي من في العلو ربنا سبحانه في العلو لأنه العلو علي' },
      { startSec: 8, text: 'خلقه سبحانه إليه يصعد الكلام الطيب أتي رافعك' },
      { startSec: 16, text: 'إليه تعرج الملائكة والروح تعرج أي تصعد فربنا سبحانه في' },
      { startSec: 23, text: 'العلو لأنه مستوٍ سبحانه فوق عرشه وعرشه فوق السماوات فهو سبحانه في العلو آمنتم' },
      { startSec: 30, text: 'في السماء أي في العلو' },
    ],
  },
];
