/** The bundled font: also what every other choice falls back to for letters it lacks. */
export const BUILT_IN_FAMILY = 'Noto Naskh Arabic';

/** "And the best companion in time is a book" (al-Mutanabbi), shown in each font. */
export const FONT_SAMPLE = 'وَخَيْرُ جَلِيسٍ فِي الزَّمَانِ كِتَابُ';

/** What the font upload input offers. */
export const FONT_FILE_ACCEPT = '.ttf,.otf,.woff,.woff2,.ttc,font/*';

const FALLBACK = `'${BUILT_IN_FAMILY}', serif`;

/** The `fontFamily` preference for a chosen font. */
export function stackFor(family: string): string {
  return `'${family}', ${FALLBACK}`;
}

/** The first family named in a stack, unquoted -- which font a stack picks. */
export function primaryFamily(stack: string): string {
  const first = stack.split(',')[0]?.trim() ?? '';
  return first.replace(/^['"]|['"]$/g, '');
}

/** Font names come from inside uploaded files: keep them safe to quote in CSS. */
export function cleanFontName(name: string): string {
  return (
    name
      // eslint-disable-next-line no-control-regex
      .replace(/['"\\;{}<>\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'Uploaded font'
  );
}

const UPLOADED_SUFFIX = ' (uploaded)';

/** Uploaded fonts get their own CSS family name, so they never clash with a
 * same-named font installed on the device. */
export function uploadedCssFamily(family: string): string {
  return cleanFontName(family) + UPLOADED_SUFFIX;
}

/** Whether a stack picks an uploaded font (which has to be loaded from storage). */
export function isUploadedStack(stack: string): boolean {
  return primaryFamily(stack).endsWith(UPLOADED_SUFFIX);
}

export interface FontFaceSource {
  cssFamily: string;
  url: string;
  weight: number;
  italic: boolean;
}

/** One @font-face rule per uploaded file. Weights are the file's own, so a
 * family uploaded as Light only still serves normal and (synthesized) bold text. */
export function buildFontFaceCss(faces: FontFaceSource[]): string {
  return faces
    .map(
      (face) =>
        `@font-face { font-family: '${face.cssFamily}'; src: url('${face.url}'); ` +
        `font-weight: ${face.weight}; font-style: ${face.italic ? 'italic' : 'normal'}; font-display: swap; }`
    )
    .join('\n');
}
