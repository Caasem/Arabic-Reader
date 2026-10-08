import type { OcrEngine, OcrRequest, OcrWord } from '../types';
import { decodeCtc } from './ctc';
import { findLine, wordSegments } from './lines';
import { paddleModelReady, paddleSession, PADDLE_MODEL_MB, type PaddleSession } from './model';

const INPUT_HEIGHT = 48;
const MAX_WIDTH = 4096;

export const PADDLE_ENGINE_ID = 'app:paddle';

interface GrayImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

async function toGray(image: Blob): Promise<GrayImage> {
  const bitmap = await createImageBitmap(image);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not read the image.');
  context.drawImage(bitmap, 0, 0);
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const data = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let i = 0; i < data.length; i++) data[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
  return { data, width: canvas.width, height: canvas.height };
}

/** The line, scaled to the model's height, as normalised planar RGB with the width padded to a multiple of 32. */
export function lineTensor(gray: GrayImage, band: { top: number; bottom: number; left: number; right: number }): { input: Float32Array; width: number; scale: number } {
  const sourceH = band.bottom - band.top;
  const sourceW = band.right - band.left;
  const scale = INPUT_HEIGHT / sourceH;
  const scaledW = Math.min(MAX_WIDTH, Math.max(8, Math.round(sourceW * scale)));
  const width = Math.ceil(scaledW / 32) * 32;
  const input = new Float32Array(3 * INPUT_HEIGHT * width);
  const plane = INPUT_HEIGHT * width;
  for (let y = 0; y < INPUT_HEIGHT; y++) {
    const sy = Math.min(gray.height - 1, band.top + Math.floor((y + 0.5) / scale));
    for (let x = 0; x < scaledW; x++) {
      const sx = Math.min(gray.width - 1, band.left + Math.floor((x + 0.5) / (scaledW / sourceW)));
      const v = (gray.data[sy * gray.width + sx] / 255 - 0.5) / 0.5;
      const at = y * width + x;
      input[at] = input[plane + at] = input[2 * plane + at] = v;
    }
  }
  return { input, width, scale: scaledW / sourceW };
}

/** Reads the line nearest the tap and returns its words with boxes. Exported with the session injectable for tests. */
export async function readLine(gray: GrayImage, y: number, session: PaddleSession): Promise<OcrWord[]> {
  const found = findLine(gray.data, gray.width, gray.height, y);
  if (!found) return [];
  // A little air above and below, for the dots and tails the row count may have cut.
  const lift = Math.round((found.bottom - found.top) * 0.12);
  const band = { ...found, top: Math.max(0, found.top - lift), bottom: Math.min(gray.height, found.bottom + lift) };
  const { input, width } = lineTensor(gray, band);
  const { scores, steps, classes } = await session.run(input, width);
  const decoded = decodeCtc(scores, steps, classes, session.charset);
  if (!decoded.length) return [];
  // The model says what the words are; where they are comes from the gaps in the ink. Its own time steps do not
  // line up with the page (it hears the line bunched together), so they are only the fallback: kept in order and
  // proportion, and stretched over the ink, when the ink does not show enough gaps.
  const segments = wordSegments(gray.data, gray.width, band, decoded.length);
  const first = decoded[0].start;
  const span = Math.max(1, decoded[decoded.length - 1].end + 1 - first);
  const ink = band.right - band.left;
  return decoded.map((word, i) => {
    const left = segments ? segments[i].left : band.left + ((word.start - first) / span) * ink;
    const right = segments ? segments[i].right : band.left + ((word.end + 1 - first) / span) * ink;
    return { text: word.text, x: left, y: band.top, w: Math.max(1, right - left), h: band.bottom - band.top };
  });
}

/**
 * Offline reading in the browser: PaddleOCR's Arabic recognizer run by onnxruntime-web. It reads one
 * line at a time, so the line at the tap is found first (from where the ink is), then read, and the
 * words come back with boxes from where the model heard them. Beta: it suits clean printed lines
 * best, and a skewed page or tightly packed lines read worse.
 */
export function createPaddleEngine(): OcrEngine {
  return {
    id: PADDLE_ENGINE_ID,
    name: 'Offline reading (beta)',
    description: 'Runs on this device after a one-time download of the reading model. Works offline, in a browser or the app.',
    kind: 'app',
    async status() {
      return (await paddleModelReady()) ? { available: true } : { available: false, reason: `Download the reading model (${PADDLE_MODEL_MB} MB) in Settings → Reading → Text recognition.` };
    },
    async recognize(request: OcrRequest): Promise<OcrWord[]> {
      if (!request.language.toLowerCase().startsWith('ar')) throw new Error('Offline reading only reads Arabic.');
      const [session, gray] = await Promise.all([paddleSession(), toGray(request.image)]);
      return readLine(gray, request.point?.y ?? gray.height / 2, session);
    },
  };
}
