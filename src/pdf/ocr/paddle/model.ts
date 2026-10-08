/**
 * The offline reading model: PaddleOCR's Arabic recognizer (Apache-2.0), exported to ONNX, and its
 * character table. It is large for a web page (7.6 MB), so it is not part of the app: the reader
 * downloads it once from Settings, it is kept in the browser's cache storage, and reading then
 * works offline. The files come from the public Hugging Face mirror below (a plain download; nothing
 * about the reader or the book is sent).
 */
export const PADDLE_MODEL_URL = 'https://huggingface.co/mxaln/docscanner-ocr/resolve/main/arabic/rec_model.onnx';
export const PADDLE_CHARSET_URL = 'https://huggingface.co/mxaln/docscanner-ocr/resolve/main/arabic/charset.json';
export const PADDLE_MODEL_MB = 8;

const CACHE_NAME = 'arabic-reader-ocr-models';
const listeners = new Set<() => void>();
let ready: boolean | null = null;

const emit = () => listeners.forEach((l) => l());
export const subscribePaddleModel = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

async function cache(): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

/** Whether both files are already on this device. */
export async function paddleModelReady(): Promise<boolean> {
  if (ready !== null) return ready;
  const store = await cache();
  ready = !!store && !!(await store.match(PADDLE_MODEL_URL)) && !!(await store.match(PADDLE_CHARSET_URL));
  return ready;
}

/** Downloads the model and character table into cache storage, reporting progress as 0..1. */
export async function downloadPaddleModel(onProgress?: (done: number) => void, fetchImpl: typeof fetch = fetch): Promise<void> {
  const store = await cache();
  if (!store) throw new Error('This browser cannot keep the model. Open the app in a normal window, not a private one.');
  const charset = await fetchImpl(PADDLE_CHARSET_URL);
  if (!charset.ok) throw new Error(`The character table could not be downloaded (${charset.status}).`);
  const response = await fetchImpl(PADDLE_MODEL_URL);
  if (!response.ok || !response.body) throw new Error(`The model could not be downloaded (${response.status}).`);
  const total = Number(response.headers.get('content-length')) || PADDLE_MODEL_MB * 1024 * 1024;
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array<ArrayBuffer>);
    received += value.length;
    onProgress?.(Math.min(received / total, 0.99));
  }
  await store.put(PADDLE_CHARSET_URL, charset);
  await store.put(PADDLE_MODEL_URL, new Response(new Blob(chunks), { headers: { 'content-type': 'application/octet-stream' } }));
  ready = true;
  onProgress?.(1);
  emit();
}

export async function removePaddleModel(): Promise<void> {
  const store = await cache();
  await store?.delete(PADDLE_MODEL_URL);
  await store?.delete(PADDLE_CHARSET_URL);
  ready = false;
  session = null;
  emit();
}

/** The downloaded model's bytes and character table. */
export async function readPaddleFiles(): Promise<{ model: ArrayBuffer; charset: string[] }> {
  const store = await cache();
  const [model, charset] = store ? await Promise.all([store.match(PADDLE_MODEL_URL), store.match(PADDLE_CHARSET_URL)]) : [undefined, undefined];
  if (!model || !charset) throw new Error('The reading model is not downloaded. Get it in Settings → Reading → Text recognition.');
  return { model: await model.arrayBuffer(), charset: (await charset.json()) as string[] };
}

export interface PaddleSession {
  /** Scores for one line image: planar RGB floats, shape [1, 3, 48, width]. Returns the raw scores and their shape. */
  run(input: Float32Array, width: number): Promise<{ scores: Float32Array; steps: number; classes: number }>;
  charset: string[];
}

let session: Promise<PaddleSession> | null = null;

/** Starts the model once (on first use) and keeps it. */
export function paddleSession(): Promise<PaddleSession> {
  session ??= (async () => {
    const [{ model, charset }, ort, wasm] = await Promise.all([
      readPaddleFiles(),
      import('onnxruntime-web/wasm'),
      import('./ortWasm'),
    ]);
    // One thread: more needs cross-origin isolation, which a plain page and the desktop app do not have.
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = { wasm: wasm.default };
    const inference = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['wasm'] });
    return {
      charset,
      async run(input: Float32Array, width: number) {
        const output = await inference.run({ [inference.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, 48, width]) });
        const result = output[inference.outputNames[0]];
        const [, steps, classes] = result.dims;
        return { scores: result.data as Float32Array, steps, classes };
      },
    };
  })().catch((error) => {
    session = null;
    throw error;
  });
  return session;
}
