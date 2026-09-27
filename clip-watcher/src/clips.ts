import type { Clip } from './types';

/**
 * Hand-picked prototype clips. Transcript text is the real timed transcript
 * scraped from YouTube's own caption track for each video (matches the
 * burned-in subtitles on screen), kept as-is including its ASR quirks --
 * e.g. clip 2's first line was transcribed as "القلب يكتب" (the heart
 * writes) where the speaker almost certainly said "يقسو" (hardens), matching
 * the clip's own title. Real automatic ingestion would inherit the same
 * noise, so it's left uncorrected here rather than silently cleaned up.
 * Vocab meanings are hand-entered -- standing in for the lookup this module
 * would eventually call over an API/props once integrated, rather than
 * depending on Arabic Reader's dictionary engine here.
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
  {
    id: 'hardness-of-heart',
    title: 'لماذا قسوة القلب؟',
    videoId: '3YHCClFUNoQ',
    startSec: 0,
    endSec: 56,
    source: '"جنتان" للمقاطع المؤثرة — الشيخ سعيد الكملي',
    vocab: [
      { surfaceForm: 'القلب', meaning: '[the] heart' },
      { surfaceForm: 'المعاصي', meaning: 'sins, transgressions' },
      { surfaceForm: 'البخاري', meaning: 'al-Bukhari (the hadith scholar)' },
      { surfaceForm: 'لقيت', meaning: 'I met, I found <verb>' },
      { surfaceForm: 'الامصار', meaning: '[the] regions, [the] lands (plural of مصر)' },
      { surfaceForm: 'الايمان', meaning: '[the] faith, belief' },
      { surfaceForm: 'يزيد', meaning: 'increases <verb>' },
      { surfaceForm: 'عجائزنا', meaning: 'our elderly people (plural of عجوز)' },
    ],
    transcript: [
      { startSec: 0, text: 'القلب يكتب بسبب المعاصي وسبب قله فعل الخير البخاري رحمه الله يقول لقيت اكثر من الف' },
      { startSec: 9, text: 'شيخه في الامصار يقولون كلهم يقول الايمان قول وعمل يزيد' },
      { startSec: 15, text: 'بالطاعات وينقص بالمعاصي يحاول ان يكثر من فعل الخير' },
      { startSec: 33, text: 'كانوا في هذه العباده شيء عجيبه لماذا ما كان يصنعه عجائزنا الاميون' },
      { startSec: 44, text: 'شبابنا العالمون امور القلب' },
    ],
  },
];
