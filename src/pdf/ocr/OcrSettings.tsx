import { useEffect, useState, useSyncExternalStore } from 'react';
import { Note, SelectRow, SettingsSection } from '../../components/shared/settings/controls';
import { CLAUDE_ENGINE_ID, CLAUDE_MODELS } from './aiEngine';
import { createEndpointEngine, isLocalAddress } from './engines';
import { initOcr } from './init';
import { downloadPaddleModel, paddleModelReady, PADDLE_MODEL_MB, removePaddleModel, subscribePaddleModel } from './paddle/model';
import { chosenOcrEngine, ocrEngines, subscribeOcrEngines } from './registry';
import { getOcrSettings, subscribeOcrSettings, updateOcrSettings, type Enhance } from './settings';
import type { OcrEngine, OcrEngineStatus } from './types';
import './ocrSettings.css';

const SAMPLE = 'اختبار';
const stripMarks = (s: string) => s.replace(/[ً-ٰٟـ\s]/g, '');

/** Draws a sample Arabic word large and dark, the way a clean scan would show it. */
async function sampleImage(): Promise<{ image: Blob; width: number; height: number }> {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 150;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not draw the sample.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#1c1a17';
  context.direction = 'rtl';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '72px "Traditional Arabic", "Amiri", "Noto Naskh Arabic", serif';
  context.fillText(SAMPLE, canvas.width / 2, canvas.height / 2);
  const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!image) throw new Error('Could not draw the sample.');
  return { image, width: canvas.width, height: canvas.height };
}

type TestResult = { ok: boolean; text: string } | { error: string } | 'running';

function EngineRow({ engine, status, chosen, test, onChoose, onTest, onRemove }: {
  engine: OcrEngine;
  status: OcrEngineStatus | undefined;
  chosen: boolean;
  test: TestResult | undefined;
  onChoose(): void;
  onTest(): void;
  onRemove?(): void;
}) {
  const pill = !status ? { cls: 'no', text: 'Checking…' } : !status.available ? { cls: 'no', text: 'Not available' } : engine.sendsImagesOffDevice ? { cls: 'cloud', text: 'Sends images out' } : { cls: 'ok', text: status.reason ? 'Ready, with a note' : 'Ready' };
  return (
    <li className={'ocr-engine' + (chosen ? ' ocr-engine--on' : '')}>
      <label className="ocr-engine__main">
        <input type="radio" name="ocr-engine" checked={chosen} disabled={status ? !status.available : false} onChange={onChoose} />
        <span className="ocr-engine__name">{engine.name}</span>
        <span className={`ocr-pill ocr-pill--${pill.cls}`}>{pill.text}</span>
      </label>
      <p className="ocr-engine__desc">{status && (!status.available || status.reason) ? status.reason : engine.description}</p>
      {chosen && (
        <div className="ocr-engine__acts">
          <button type="button" className="ocr-btn" onClick={onTest} disabled={test === 'running' || (status ? !status.available : true)}>
            {test === 'running' ? 'Testing…' : 'Test engine'}
          </button>
          {test && test !== 'running' && ('error' in test ? <span className="ocr-result ocr-result--bad">{test.error}</span> : <span className={'ocr-result ' + (test.ok ? 'ocr-result--ok' : 'ocr-result--bad')}>{test.ok ? 'Read correctly' : 'Read something else'} <bdi lang="ar" dir="rtl">{test.text}</bdi></span>)}
          {onRemove && (
            <button type="button" className="ocr-btn ocr-btn--quiet" onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      )}
      {!chosen && onRemove && (
        <div className="ocr-engine__acts">
          <button type="button" className="ocr-btn ocr-btn--quiet" onClick={onRemove}>
            Remove
          </button>
        </div>
      )}
    </li>
  );
}

function AddEngine({ onAdded, onCancel }: { onAdded(id: string): void; onCancel(): void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const remote = /^https?:\/\//i.test(url) && !isLocalAddress(url);

  async function add() {
    const id = `custom:${Math.random().toString(36).slice(2, 10)}`;
    const config = { id, name: name.trim() || new URL(url.trim() || 'http://x').hostname, url: url.trim() };
    const status = await createEndpointEngine(config).status();
    if (!status.available) return setError(status.reason ?? 'That address does not work.');
    updateOcrSettings({ custom: [...getOcrSettings().custom, config], engineId: id });
    onAdded(id);
  }

  return (
    <div className="ocr-add">
      <label className="ocr-field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Tesseract server" />
      </label>
      <label className="ocr-field">
        <span>Address</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:8080/ocr" inputMode="url" />
      </label>
      {remote && <p className="ocr-warn">This address is on the internet. It would receive an image of the line you tap on every lookup.</p>}
      {error && <p className="ocr-warn">{error}</p>}
      <details className="ocr-contract">
        <summary>What the address must answer</summary>
        <p>The Reader posts a PNG (<code>Content-Type: image/png</code>, <code>?lang=ar</code>). Answer JSON with each word and its box in the image's pixels:</p>
        <pre>{`{ "words": [ { "text": "المدرسة", "x": 412, "y": 38, "w": 118, "h": 44 } ] }`}</pre>
        <p>A web page can only reach an address that allows it (CORS). The desktop app has no such limit.</p>
      </details>
      <div className="ocr-engine__acts">
        <button type="button" className="ocr-btn ocr-btn--primary" disabled={!/^https?:\/\//i.test(url.trim())} onClick={() => void add()}>
          Add engine
        </button>
        <button type="button" className="ocr-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The one-time download behind Offline reading: the model is kept in the browser and works offline after. */
function OfflineModel() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const check = () => void paddleModelReady().then((r) => !cancelled && setReady(r));
    check();
    const unsubscribe = subscribePaddleModel(() => void paddleModelReady().then((r) => !cancelled && setReady(r)));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  async function download() {
    setError(null);
    setProgress(0);
    try {
      await downloadPaddleModel(setProgress);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The download failed.');
    } finally {
      setProgress(null);
    }
  }
  return (
    <div className="ocr-add">
      <strong>Offline reading model</strong>
      <p className="ocr-engine__desc ocr-engine__desc--flush">
        PaddleOCR’s Arabic reader ({PADDLE_MODEL_MB} MB, Apache-2.0). Downloaded once from a public mirror, kept in this browser, and used offline. Nothing about you or your books is sent.
      </p>
      <div className="ocr-engine__acts ocr-engine__acts--flush">
        {ready ? (
          <>
            <span className="ocr-pill ocr-pill--ok">Downloaded</span>
            <button type="button" className="ocr-btn ocr-btn--quiet" onClick={() => void removePaddleModel()}>
              Remove
            </button>
          </>
        ) : (
          <button type="button" className="ocr-btn ocr-btn--primary" disabled={progress !== null} onClick={() => void download()}>
            {progress === null ? `Download (${PADDLE_MODEL_MB} MB)` : `Downloading… ${Math.round(progress * 100)}%`}
          </button>
        )}
      </div>
      {error && <p className="ocr-warn">{error}</p>}
    </div>
  );
}

/** The reader's own Anthropic key, which turns on the Claude engine above. Kept on this device. */
function ClaudeKey({ claudeKey, claudeModel }: { claudeKey?: string; claudeModel?: string }) {
  const [draft, setDraft] = useState('');
  return (
    <div className="ocr-add">
      <strong>Claude (AI vision)</strong>
      <p className="ocr-engine__desc ocr-engine__desc--flush">
        Uses your own Anthropic key. Each lookup sends an image of the line you tapped to Anthropic, so it is only used when you choose it or set it as the second opinion. The key stays on this device.
      </p>
      {claudeKey ? (
        <div className="ocr-engine__acts ocr-engine__acts--flush">
          <span className="ocr-pill ocr-pill--ok">Key saved · …{claudeKey.slice(-4)}</span>
          <button type="button" className="ocr-btn ocr-btn--quiet" onClick={() => updateOcrSettings({ claudeKey: undefined, engineId: getOcrSettings().engineId === CLAUDE_ENGINE_ID ? undefined : getOcrSettings().engineId, fallbackId: getOcrSettings().fallbackId === CLAUDE_ENGINE_ID ? undefined : getOcrSettings().fallbackId })}>
            Remove key
          </button>
        </div>
      ) : (
        <div className="ocr-engine__acts ocr-engine__acts--flush">
          <input
            className="ocr-key"
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="sk-ant-…"
            aria-label="Anthropic API key"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="ocr-btn ocr-btn--primary" disabled={draft.trim().length < 20} onClick={() => updateOcrSettings({ claudeKey: draft.trim() })}>
            Save key
          </button>
        </div>
      )}
      <SelectRow
        label="Model"
        options={CLAUDE_MODELS.map((m) => ({ id: m.id, label: m.label }))}
        value={claudeModel && CLAUDE_MODELS.some((m) => m.id === claudeModel) ? claudeModel : CLAUDE_MODELS[0].id}
        onChange={(m) => updateOcrSettings({ claudeModel: m })}
      />
    </div>
  );
}

const ENHANCE_OPTIONS: { id: Enhance; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'contrast', label: 'Contrast' },
  { id: 'binarize', label: 'Black and white' },
];

/** Settings → Reading → Text recognition: which engine reads scanned PDF pages, and how to add your own. */
export function PdfOcrSettings() {
  useEffect(initOcr, []);
  const engines = useSyncExternalStore(subscribeOcrEngines, ocrEngines, ocrEngines);
  const settings = useSyncExternalStore(subscribeOcrSettings, getOcrSettings, getOcrSettings);
  const chosen = chosenOcrEngine();
  const [statuses, setStatuses] = useState<Record<string, OcrEngineStatus>>({});
  const [tests, setTests] = useState<Record<string, TestResult>>({});
  const [adding, setAdding] = useState(false);

  const [modelChanges, setModelChanges] = useState(0);
  useEffect(() => subscribePaddleModel(() => setModelChanges((n) => n + 1)), []);
  useEffect(() => {
    let cancelled = false;
    for (const engine of engines) {
      void engine.status().then((status) => !cancelled && setStatuses((s) => ({ ...s, [engine.id]: status })));
    }
    return () => {
      cancelled = true;
    };
  }, [engines, modelChanges, settings.claudeKey]);

  async function runTest(engine: OcrEngine) {
    setTests((t) => ({ ...t, [engine.id]: 'running' }));
    try {
      const sample = await sampleImage();
      const words = await engine.recognize({ ...sample, language: 'ar' });
      const text = words.map((w) => w.text).join(' ');
      setTests((t) => ({ ...t, [engine.id]: { ok: stripMarks(text).includes(SAMPLE), text } }));
    } catch (error) {
      setTests((t) => ({ ...t, [engine.id]: { error: error instanceof Error ? error.message : 'The test failed.' } }));
    }
  }

  function remove(id: string) {
    updateOcrSettings({ custom: settings.custom.filter((c) => c.id !== id), engineId: settings.engineId === id ? undefined : settings.engineId });
  }

  return (
    <SettingsSection title="Text recognition">
      <Note>
        Reads words on scanned PDF pages when you tap them. Pages that already have text never use it. Pick the engine that reads Arabic best for you.
      </Note>
      {engines.length === 0 ? (
        <Note>This device has no built-in text recognition. Add an engine of your own below to read scanned pages here.</Note>
      ) : (
        <ul className="ocr-engines">
          {engines.map((engine) => (
            <EngineRow
              key={engine.id}
              engine={engine}
              status={statuses[engine.id]}
              chosen={chosen?.id === engine.id}
              test={tests[engine.id]}
              onChoose={() => updateOcrSettings({ engineId: engine.id })}
              onTest={() => void runTest(engine)}
              onRemove={engine.kind === 'custom' ? () => remove(engine.id) : undefined}
            />
          ))}
        </ul>
      )}
      {adding ? (
        <AddEngine onAdded={() => setAdding(false)} onCancel={() => setAdding(false)} />
      ) : (
        <div className="ocr-engine__acts">
          <button type="button" className="ocr-btn" onClick={() => setAdding(true)}>
            + Add your own engine
          </button>
        </div>
      )}
      <OfflineModel />
      <ClaudeKey claudeKey={settings.claudeKey} claudeModel={settings.claudeModel} />
      <SelectRow
        label="If the first read is not a word, ask"
        options={[{ id: 'none', label: 'Nobody else' }, ...engines.filter((e) => e.id !== chosen?.id && statuses[e.id]?.available).map((e) => ({ id: e.id, label: e.name }))]}
        value={settings.fallbackId && settings.fallbackId !== chosen?.id && statuses[settings.fallbackId]?.available ? settings.fallbackId : 'none'}
        onChange={(id) => updateOcrSettings({ fallbackId: id === 'none' ? undefined : id })}
      />
      <Note>
        A second opinion is only asked when the dictionary does not recognise the first read, and the dictionary then decides between the two. An engine that sends images out is marked above.
      </Note>
      <details className="ocr-tuning">
        <summary>Tuning</summary>
        <SelectRow
          label="Crop sharpness"
          options={[2, 3, 4, 5, 6].map((n) => ({ id: String(n), label: `${n}×` }))}
          value={String(Math.round(settings.scale))}
          onChange={(v) => updateOcrSettings({ scale: Number(v) })}
        />
        <SelectRow label="Image clean-up" options={ENHANCE_OPTIONS} value={settings.enhance} onChange={(enhance) => updateOcrSettings({ enhance })} />
        <SelectRow
          label="Line height read around a tap"
          options={[30, 44, 60, 80].map((n) => ({ id: String(n), label: `${n} pt` }))}
          value={String([30, 44, 60, 80].reduce((a, b) => (Math.abs(b - settings.stripPt) < Math.abs(a - settings.stripPt) ? b : a)))}
          onChange={(v) => updateOcrSettings({ stripPt: Number(v) })}
        />
        <Note>Larger text or a dense page may read better with a taller line or a sharper crop. The defaults suit most printed books.</Note>
      </details>
    </SettingsSection>
  );
}
