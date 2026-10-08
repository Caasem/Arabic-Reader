import type { OcrEngine, OcrRequest, OcrWord } from './types';
import { getOcrSettings } from './settings';

/**
 * An AI vision model as a text-recognition engine. It reads one word, not a whole line with boxes: a
 * small red dot is drawn on the crop where the reader tapped and the model is asked which word it
 * marks. Accurate on diacritics and poor print, but each use sends an image of the crop to the
 * provider, so it is off until the reader adds their own key and chooses it (or sets it as the second
 * opinion). The key stays on this device.
 */
export const CLAUDE_MODELS: { id: string; label: string }[] = [
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast, cheap)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (most careful)' },
];

export const CLAUDE_ENGINE_ID = 'ai:claude';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const PROMPT =
  'This is a crop from a scanned Arabic book. A small red dot marks one word. Reply with only that word, exactly as printed: Arabic letters, keeping vowel marks if they are printed, with no punctuation, translation or explanation. If you cannot tell which word is marked, reply with the word nearest the dot.';

/** Draws the red dot on the crop and returns it as base64 PNG (no prefix). */
async function marked(request: OcrRequest): Promise<string> {
  const bitmap = await createImageBitmap(request.image);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the image.');
  context.drawImage(bitmap, 0, 0);
  const at = request.point ?? { x: canvas.width / 2, y: canvas.height / 2 };
  const radius = Math.max(6, canvas.height * 0.05);
  context.beginPath();
  context.arc(at.x, at.y - canvas.height * 0.28, radius, 0, Math.PI * 2);
  context.fillStyle = '#e02424';
  context.fill();
  context.lineWidth = Math.max(2, radius / 3);
  context.strokeStyle = '#fff';
  context.stroke();
  const url = canvas.toDataURL('image/png');
  return url.slice(url.indexOf(',') + 1);
}

export function createClaudeEngine(deps: { fetchImpl?: typeof fetch; mark?: (request: OcrRequest) => Promise<string> } = {}): OcrEngine {
  return {
    id: CLAUDE_ENGINE_ID,
    name: 'Claude (AI vision)',
    description: 'Reads the word you tap with your own Anthropic key. Each lookup sends an image of the crop to Anthropic.',
    kind: 'ai',
    sendsImagesOffDevice: true,
    async status() {
      return getOcrSettings().claudeKey ? { available: true } : { available: false, reason: 'Add your Anthropic API key in Settings → Reading → Text recognition.' };
    },
    async recognize(request, signal): Promise<OcrWord[]> {
      const { claudeKey, claudeModel } = getOcrSettings();
      if (!claudeKey) throw new Error('Add your Anthropic API key in Settings first.');
      const data = await (deps.mark ?? marked)(request);
      const response = await (deps.fetchImpl ?? fetch)(ENDPOINT, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: claudeModel ?? CLAUDE_MODELS[0].id,
          max_tokens: 40,
          messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data } }, { type: 'text', text: PROMPT }] }],
        }),
      });
      if (response.status === 401 || response.status === 403) throw new Error('Anthropic did not accept the API key.');
      if (response.status === 429) throw new Error('Anthropic says too many requests. Try again in a moment.');
      if (!response.ok) throw new Error(`Anthropic answered ${response.status}.`);
      const body = (await response.json()) as { content?: { type: string; text?: string }[] };
      const text = body.content?.find((c) => c.type === 'text')?.text?.trim().split(/\s+/)[0] ?? '';
      if (!text) return [];
      // One word, placed on the dot so the tap picks it.
      const at = request.point ?? { x: request.width / 2, y: request.height / 2 };
      return [{ text, x: at.x - 40, y: at.y - 24, w: 80, h: 48 }];
    },
  };
}
