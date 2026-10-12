import { useEffect, useState } from 'react';
import { usePreferences } from '../../../state/PreferencesContext';
import { dictionaryManager } from '../../../dictionary';
import { orderProviders } from '../../../dictionary/providerOrder';
import { ProviderOrderList } from './ProviderOrderList';
import { aramorphProvider } from '../../../dictionary/providers/aramorph/AramorphDictionaryProvider';
import type { DictionaryPanelLayout, MorphDisplayStyle } from '../../../types';
import { AramorphDataSettings } from './AramorphDataSettings';
import { PersonalDictionarySettings } from './PersonalDictionarySettings';
import { Note, type Option, RangeRow, SegmentedRow, SelectRow, SettingsSection, ToggleRow } from './controls';
import { PackRow } from '../../../packManager/PackRow';

const MORPH_DISPLAY_STYLES: Option<MorphDisplayStyle>[] = [
  { id: 'caption', label: 'Caption' },
  { id: 'badges', label: 'Badges' },
];

const PANEL_LAYOUTS: Option<DictionaryPanelLayout>[] = [
  { id: 'merged', label: 'Merged' },
  { id: 'split', label: 'Split' },
  { id: 'single', label: 'Single' },
];

export function DictionarySettings() {
  const { prefs, updatePrefs } = usePreferences();
  const [aramorphReady, setAramorphReady] = useState(aramorphProvider.isReady);
  const providers = orderProviders(dictionaryManager.getProviders(), prefs.dictionaryProviderOrder ?? []);
  const enabledProviders = providers.filter((p) => prefs.enabledProviderIds.includes(p.id));

  // The bundled dataset finishes loading after this mounts.
  useEffect(() => {
    let cancelled = false;
    aramorphProvider.whenReady().then(() => {
      if (!cancelled) setAramorphReady(aramorphProvider.isReady);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleProvider(id: string, on: boolean) {
    const next = on ? Array.from(new Set([...prefs.enabledProviderIds, id])) : prefs.enabledProviderIds.filter((p) => p !== id);
    updatePrefs({ enabledProviderIds: next });
  }

  return (
    <SettingsSection title="Dictionaries">
      <Note>Choose which dictionaries are queried when you tap a word.</Note>

      <RangeRow
        label="Dictionary popup size"
        min={70}
        max={150}
        step={5}
        value={prefs.dictionaryPopupSizePct}
        format={(v) => `${v}%`}
        onChange={(dictionaryPopupSizePct) => updatePrefs({ dictionaryPopupSizePct })}
      />
      <Note>
        100% is the popup's normal size. The popup always repositions itself to stay fully on-screen regardless of
        this setting.
      </Note>

      <SegmentedRow
        label="Root/form display"
        options={MORPH_DISPLAY_STYLES}
        value={prefs.morphDisplayStyle}
        onChange={(morphDisplayStyle) => updatePrefs({ morphDisplayStyle })}
      />
      <Note>
        When a dictionary entry's root or dictionary form differs from the word shown, this is how the popup displays
        it — a small caption line, or a pair of small badges.
      </Note>

      <SegmentedRow
        label="Multiple dictionaries"
        options={PANEL_LAYOUTS}
        value={prefs.dictionaryPanelLayout}
        onChange={(dictionaryPanelLayout) => updatePrefs({ dictionaryPanelLayout })}
      />
      <Note>
        When more than one dictionary has an entry for a word: <strong>Merged</strong> stacks every dictionary's
        entries together (the default) — <strong>Split</strong> shows the exact same entries side by side instead (a
        switcher between them on narrow screens), for comparing sources directly — <strong>Single</strong> shows only
        one dictionary and hides the rest
      </Note>
      {prefs.dictionaryPanelLayout === 'single' && (
        <SelectRow
          label="Which dictionary"
          options={[{ id: '', label: 'First available' }, ...enabledProviders.map((p) => ({ id: p.id, label: p.name }))]}
          value={prefs.dictionaryPanelSingleProviderId ?? ''}
          onChange={(id) => updatePrefs({ dictionaryPanelSingleProviderId: id || null })}
        />
      )}

      <ToggleRow
        label="Pin Save/Edit buttons"
        checked={prefs.dictionaryPopupPinFooter}
        onChange={(dictionaryPopupPinFooter) => updatePrefs({ dictionaryPopupPinFooter })}
      >
        Keeps the stats line and Save Vocabulary/Edit buttons fixed at the bottom of the popup instead of scrolling
        away with a long entry list.
      </ToggleRow>

      <ToggleRow
        label="Show translation on hover"
        checked={prefs.hoverPreviewEnabled}
        onChange={(hoverPreviewEnabled) => updatePrefs({ hoverPreviewEnabled })}
      >
        Hovering a word (mouse only — not for touch) shows a condensed one-line preview. Tapping or clicking still
        opens the full entry as before.
      </ToggleRow>

      <ToggleRow
        label="Capture sentence context"
        checked={prefs.sentenceContextEnabled}
        onChange={(sentenceContextEnabled) => updatePrefs({ sentenceContextEnabled })}
      >
        When on, clicking a word also grabs the sentence it appeared in and stores it alongside the lookup — shown in
        the popup, on the Vocabulary card, and used as context in Review and Anki sync.
      </ToggleRow>

      <ToggleRow
        label="Quick-add shortcut (Ctrl+Shift+A)"
        checked={prefs.quickAddShortcutEnabled}
        onChange={(quickAddShortcutEnabled) => updatePrefs({ quickAddShortcutEnabled })}
      >
        When on, press Ctrl+Shift+A any time after clicking a word to save it straight to your vocabulary, without
        opening the popup or clicking "+ Add."
      </ToggleRow>

      <ToggleRow
        label="Space saves the open word"
        checked={prefs.spaceSavesWord}
        onChange={(spaceSavesWord) => updatePrefs({ spaceSavesWord })}
      >
        With a word&apos;s dictionary open, press Space to save it. Space never removes a saved word.
      </ToggleRow>

      <ToggleRow
        label="Full-page dictionary"
        checked={prefs.dictionaryFullPageEnabled}
        onChange={(dictionaryFullPageEnabled) => updatePrefs({ dictionaryFullPageEnabled })}
      >
        A Dictionary screen in the menu, and a button (or F) in the popup that opens the word there, with a tab per
        dictionary and the headwords around it.
      </ToggleRow>

      <Note>The order below is the order dictionaries appear in the popup (and which one is first in Split). Drag the grip to change it (or focus it and press the up and down arrow keys).</Note>
      <ProviderOrderList
        providers={providers}
        enabledIds={prefs.enabledProviderIds}
        onToggle={toggleProvider}
        onReorder={(dictionaryProviderOrder) => updatePrefs({ dictionaryProviderOrder })}
        extra={(id) =>
          id === 'aramorph' && (
            <span className={'settings-badge' + (aramorphReady ? ' settings-badge--ready' : '')}>
              {aramorphReady ? 'Data loaded' : aramorphProvider.status === 'failed' ? 'Failed to load' : 'No data loaded'}
            </span>
          )
        }
      />

      <Note>
        Al-Muʿjam al-Wasīṭ is off by default: its data (~6,700 entries, looked up by root via the AraMorph analysis
        above) is only downloaded the first time you switch it on, and its licensing status is less clear-cut than
        this app's other sources — see <code>alwasit-data/SOURCE-README.md</code> for details before enabling it if you
        plan to redistribute this app.
      </Note>
      <Note>
        Al-Ṣiḥāḥ (al-Jawharī) and Maqāyīs al-Lugha (Ibn Fāris) are classical works in the public domain and are also off
        by default. Both are filed by root, so a lookup resolves the tapped word to its root through AraMorph and shows that
        root's article — about 5,650 roots in Al-Ṣiḥāḥ, 5,270 in Maqāyīs. Their data downloads the first time you switch
        each one on; see <code>alsihah-data/SOURCE-README.md</code> and <code>almaqayis-data/SOURCE-README.md</code>.
      </Note>

      <Note>
        Lane's Lexicon (Arabic–English, 1863–93, public domain) is also off by default and filed by root the same way
        — about 5,060 roots, a large download the first time you switch it on; see <code>lane-data/SOURCE-README.md</code>.
        Hans Wehr is listed too, but it is under copyright, so the app ships it empty: switching it on shows a note
        explaining how to add your own copy (<code>hanswehr-data/SOURCE-README.md</code>).
      </Note>

      <PackRow id="alsihah" />

      <PersonalDictionarySettings onImported={() => toggleProvider('personal', true)} />

      <AramorphDataSettings
        ready={aramorphReady}
        onReadyChange={setAramorphReady}
        onImported={() => toggleProvider('aramorph', true)}
      />
    </SettingsSection>
  );
}
