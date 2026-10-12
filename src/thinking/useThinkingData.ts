import { useEffect, useMemo, useState } from 'react';
import { listDesks, listItems, listJournal, listLinks, onDeskChange } from '../studyDesk/deskStore';
import type { Desk, DeskItem, DeskLink, JournalEntry } from '../studyDesk/types';

export interface ThinkingData {
  desks: Desk[];
  items: DeskItem[];
  links: DeskLink[];
  journal: JournalEntry[];
  byId: Map<string, DeskItem>;
  loaded: boolean;
}

/** Every desk, item, link and journal line, kept current as anything changes them. */
export function useThinkingData(): ThinkingData {
  const [data, setData] = useState<Omit<ThinkingData, 'byId'>>({ desks: [], items: [], links: [], journal: [], loaded: false });
  useEffect(() => {
    let alive = true;
    const load = () =>
      void Promise.all([listDesks(), listItems(), listLinks(), listJournal()]).then(([desks, items, links, journal]) => {
        if (alive) setData({ desks, items, links, journal, loaded: true });
      });
    load();
    const off = onDeskChange(load);
    return () => {
      alive = false;
      off();
    };
  }, []);
  const byId = useMemo(() => new Map(data.items.map((i) => [i.id, i])), [data.items]);
  return { ...data, byId };
}
