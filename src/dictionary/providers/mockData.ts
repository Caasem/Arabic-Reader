/**
 * Mock lexical data for the two demo dictionary providers, keyed by
 * normalized (diacritic-stripped) lemma. This stands in for a real
 * Arabic dictionary/morphology backend — see DictionaryManager for how a
 * real provider would be plugged in without changing the reader.
 */
export interface MockLexeme {
  lemma: string; // normalized, no diacritics
  vocalized: string; // fully vocalized headword, e.g. القَرْيَةُ
  root?: string; // space-separated root letters, e.g. "ق ر ي"
  pos: string;
  gender?: string;
  glossShort: string; // Dictionary A style
  glossLong: string; // Dictionary B style, may include multiple senses separated by ;
}

export const MOCK_LEXICON: MockLexeme[] = [
  { lemma: 'قرية', vocalized: 'اَلْقَرْيَةُ', root: 'ق ر ي', pos: 'اسم', gender: 'مؤنث', glossShort: 'village', glossLong: 'village; small settlement' },
  { lemma: 'فتى', vocalized: 'اَلْفَتَى', root: 'ف ت ي', pos: 'اسم', gender: 'مذكر', glossShort: 'young man', glossLong: 'young man; youth' },
  { lemma: 'صديق', vocalized: 'صَدِيق', root: 'ص د ق', pos: 'اسم', gender: 'مذكر', glossShort: 'friend', glossLong: 'friend; companion' },
  { lemma: 'رجل', vocalized: 'رَجُل', root: 'ر ج ل', pos: 'اسم', gender: 'مذكر', glossShort: 'man', glossLong: 'man; (pl.) men' },
  { lemma: 'قوي', vocalized: 'قَوِيّ', root: 'ق و ي', pos: 'صفة', glossShort: 'strong', glossLong: 'strong; powerful' },
  { lemma: 'مكان', vocalized: 'مَكَان', root: 'ك و ن', pos: 'اسم', gender: 'مذكر', glossShort: 'place', glossLong: 'place; location; spot' },
  { lemma: 'شجرة', vocalized: 'شَجَرَة', root: 'ش ج ر', pos: 'اسم', gender: 'مؤنث', glossShort: 'tree', glossLong: 'tree' },
  { lemma: 'كبير', vocalized: 'كَبِير', root: 'ك ب ر', pos: 'صفة', glossShort: 'big; great', glossLong: 'big; large; great; elder' },
  { lemma: 'حقل', vocalized: 'حَقْل', root: 'ح ق ل', pos: 'اسم', gender: 'مذكر', glossShort: 'field', glossLong: 'field (agricultural)' },
  { lemma: 'بحث', vocalized: 'بَحَثَ', root: 'ب ح ث', pos: 'فعل', glossShort: 'to search', glossLong: 'to search (for); to look (for); to research' },
  { lemma: 'مشى', vocalized: 'مَشَى', root: 'م ش ي', pos: 'فعل', glossShort: 'to walk', glossLong: 'to walk; to go on foot' },
  { lemma: 'رأى', vocalized: 'رَأَى', root: 'ر أ ي', pos: 'فعل', glossShort: 'to see', glossLong: 'to see; to notice' },
  { lemma: 'ذهب', vocalized: 'ذَهَبَ', root: 'ذ ه ب', pos: 'فعل', glossShort: 'to go', glossLong: 'to go; to depart' },
  { lemma: 'بيت', vocalized: 'بَيْت', root: 'ب ي ت', pos: 'اسم', gender: 'مذكر', glossShort: 'house', glossLong: 'house; home' },
  { lemma: 'كتاب', vocalized: 'كِتَاب', root: 'ك ت ب', pos: 'اسم', gender: 'مذكر', glossShort: 'book', glossLong: 'book' },
  { lemma: 'كان', vocalized: 'كَانَ', root: 'ك و ن', pos: 'فعل ناقص', glossShort: 'to be; was', glossLong: 'to be; was/were (auxiliary of the past)' },
  { lemma: 'جميل', vocalized: 'جَمِيل', root: 'ج م ل', pos: 'صفة', glossShort: 'beautiful', glossLong: 'beautiful; handsome; nice' },
  { lemma: 'ولد', vocalized: 'وَلَد', root: 'و ل د', pos: 'اسم', gender: 'مذكر', glossShort: 'boy; child', glossLong: 'boy; child; son' },
  { lemma: 'بنت', vocalized: 'بِنْت', root: 'ب ن ت', pos: 'اسم', gender: 'مؤنث', glossShort: 'girl', glossLong: 'girl; daughter' },
  { lemma: 'مدرسة', vocalized: 'مَدْرَسَة', root: 'د ر س', pos: 'اسم', gender: 'مؤنث', glossShort: 'school', glossLong: 'school' },
  { lemma: 'معلم', vocalized: 'مُعَلِّم', root: 'ع ل م', pos: 'اسم', gender: 'مذكر', glossShort: 'teacher', glossLong: 'teacher; instructor' },
  { lemma: 'يوم', vocalized: 'يَوْم', root: 'ي و م', pos: 'اسم', gender: 'مذكر', glossShort: 'day', glossLong: 'day' },
  { lemma: 'قرأ', vocalized: 'قَرَأَ', root: 'ق ر أ', pos: 'فعل', glossShort: 'to read', glossLong: 'to read; to recite' },
  { lemma: 'كتب', vocalized: 'كَتَبَ', root: 'ك ت ب', pos: 'فعل', glossShort: 'to write', glossLong: 'to write' },
  { lemma: 'عرف', vocalized: 'عَرَفَ', root: 'ع ر ف', pos: 'فعل', glossShort: 'to know', glossLong: 'to know; to recognize' },
  { lemma: 'اراد', vocalized: 'أَرَادَ', root: 'ر و د', pos: 'فعل', glossShort: 'to want', glossLong: 'to want; to intend; to wish' },
  { lemma: 'قال', vocalized: 'قَالَ', root: 'ق و ل', pos: 'فعل', glossShort: 'to say', glossLong: 'to say; to tell' },
  { lemma: 'سال', vocalized: 'سَأَلَ', root: 'س أ ل', pos: 'فعل', glossShort: 'to ask', glossLong: 'to ask; to inquire' },
  { lemma: 'جواب', vocalized: 'جَوَاب', root: 'ج و ب', pos: 'اسم', gender: 'مذكر', glossShort: 'answer', glossLong: 'answer; reply' },
  { lemma: 'طريق', vocalized: 'طَرِيق', root: 'ط ر ق', pos: 'اسم', glossShort: 'road; way', glossLong: 'road; way; path' },
  { lemma: 'نهر', vocalized: 'نَهْر', root: 'ن ه ر', pos: 'اسم', gender: 'مذكر', glossShort: 'river', glossLong: 'river' },
  { lemma: 'جبل', vocalized: 'جَبَل', root: 'ج ب ل', pos: 'اسم', gender: 'مذكر', glossShort: 'mountain', glossLong: 'mountain' },
  { lemma: 'بحر', vocalized: 'بَحْر', root: 'ب ح ر', pos: 'اسم', gender: 'مذكر', glossShort: 'sea', glossLong: 'sea; ocean' },
  { lemma: 'شمس', vocalized: 'شَمْس', root: 'ش م س', pos: 'اسم', gender: 'مؤنث', glossShort: 'sun', glossLong: 'sun' },
  { lemma: 'قمر', vocalized: 'قَمَر', root: 'ق م ر', pos: 'اسم', gender: 'مذكر', glossShort: 'moon', glossLong: 'moon' },
  { lemma: 'نجمة', vocalized: 'نَجْمَة', root: 'ن ج م', pos: 'اسم', gender: 'مؤنث', glossShort: 'star', glossLong: 'star' },
  { lemma: 'سماء', vocalized: 'سَمَاء', root: 'س م و', pos: 'اسم', gender: 'مؤنث', glossShort: 'sky', glossLong: 'sky; heaven' },
  { lemma: 'ارض', vocalized: 'أَرْض', root: 'أ ر ض', pos: 'اسم', gender: 'مؤنث', glossShort: 'earth; land', glossLong: 'earth; land; ground' },
];

const byLemma = new Map(MOCK_LEXICON.map((l) => [l.lemma, l]));

export function findLexeme(candidates: string[]): MockLexeme | undefined {
  for (const c of candidates) {
    const hit = byLemma.get(c);
    if (hit) return hit;
  }
  return undefined;
}
