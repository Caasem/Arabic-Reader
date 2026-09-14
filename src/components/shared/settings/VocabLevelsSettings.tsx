import { useEffect, useState } from 'react';
import { disableRarityData, enableRarityData, isRarityDataReady } from '../../../vocabRarity/rarity';
import { Note, SettingsSection } from './controls';

export function VocabLevelsSettings() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isRarityDataReady().then((isReady) => {
      if (!cancelled) setReady(isReady);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function setEnabled(enable: boolean) {
    setBusy(true);
    try {
      await (enable ? enableRarityData() : disableRarityData());
      setReady(enable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSection title="Vocabulary Levels">
      <Note>
        Powers the rarity badge shown in word lookups and the "Vocab Levels" tab's beginner/intermediate/advanced word
        lists — derived from a personal, frequency-ordered vocabulary list built into the app. Small enough to be ready
        instantly, no download involved.
      </Note>
      {ready !== null && (
        <div className="settings-row">
          <span className={'settings-badge' + (ready ? ' settings-badge--ready' : '')}>{ready ? 'Enabled' : 'Not enabled'}</span>
          <button className="btn btn--ghost" onClick={() => setEnabled(!ready)} disabled={busy}>
            {ready ? (busy ? 'Disabling…' : 'Disable') : busy ? 'Preparing…' : 'Enable now'}
          </button>
        </div>
      )}
    </SettingsSection>
  );
}
