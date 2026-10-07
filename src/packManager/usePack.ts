import { useEffect, useState } from 'react';
import { getPackManager, type PackInfo } from '.';

/** The pack's current state, kept up to date while it downloads. Undefined until known or when the manifest does not list it. */
export function usePackInfo(id: string): PackInfo | undefined {
  const [info, setInfo] = useState<PackInfo | undefined>(undefined);
  useEffect(() => {
    const packs = getPackManager();
    let cancelled = false;
    const load = () => {
      void packs.status(id).then((next) => {
        if (!cancelled) setInfo(next);
      });
    };
    load();
    const unsubscribe = packs.subscribe(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [id]);
  return info;
}
