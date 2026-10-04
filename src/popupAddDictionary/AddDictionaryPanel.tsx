import { useEffect, useRef, useState } from 'react';
import { matchOffProviders } from './matchProviders';

/** The search box under the popup's header: type a dictionary's name, press Enter to turn on the first match. */
export function AddDictionaryPanel({
  providers,
  enabledIds,
  onAdd,
  onClose,
}: {
  providers: { id: string; name: string }[];
  enabledIds: string[];
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = matchOffProviders(providers, enabledIds, query);
  const allOn = matchOffProviders(providers, enabledIds, '').length === 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape closes this box first, not the popup behind it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="dict-popup__add" dir="ltr" role="dialog" aria-label="Add a dictionary">
      <input
        ref={inputRef}
        type="search"
        className="dict-popup__add-input"
        placeholder="Add a dictionary…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) onAdd(matches[0].id);
        }}
        autoComplete="off"
        spellCheck={false}
      />
      {matches.map((p, i) => (
        <button type="button" className="dict-popup__add-row" key={p.id} onClick={() => onAdd(p.id)}>
          <span>{p.name}</span>
          {i === 0 && <span className="dict-popup__add-key">Enter</span>}
        </button>
      ))}
      {!matches.length && <div className="dict-popup__add-empty">{allOn ? 'Every dictionary is already on.' : 'No dictionary by that name.'}</div>}
      {matches.length > 0 && <div className="dict-popup__add-note">Its data downloads the first time you add it.</div>}
    </div>
  );
}
