import { ROLE_BY_ID, type ArgItem, type ArgumentRole } from './roles';

const TITLES = {
  also: 'Also grounds for…',
  claim: 'For which claim?',
  grounds: 'For which step (its grounds)?',
  warrant: 'Backs which warrant?',
  objection: 'Replies to which objection?',
} as const;

export const pickerTitle = (role: ArgumentRole): string => TITLES[ROLE_BY_ID[role].needs];

/**
 * Items a new `role` could point at, nearest to `at` first. An objection is aimed at the main claim, so
 * top-level claims come before steps.
 */
export function candidates(items: readonly ArgItem[], role: ArgumentRole, at: number, excludeId?: string): ArgItem[] {
  const need = ROLE_BY_ID[role].needs;
  const wanted = need === 'also' ? 'claim' : need;
  const rank = (n: ArgItem) => (role === 'objection' && n.for ? 1 : 0);
  return items
    .filter((n) => n.role === wanted && n.id !== excludeId)
    .sort((a, b) => rank(a) - rank(b) || Math.abs(a.spot - at) - Math.abs(b.spot - at));
}

/** The picker's entries. For a claim a leading `null` means "not a step in a longer argument". At most 8 (keys 1 to 8). */
export function pickerList(role: ArgumentRole, found: readonly ArgItem[]): (ArgItem | null)[] {
  return (ROLE_BY_ID[role].needs === 'also' ? [null, ...found] : [...found]).slice(0, 8);
}

/** Toast when a role was added but nothing exists to attach it to; null when no toast is due. */
export function nothingToAttach(role: ArgumentRole, found: readonly ArgItem[]): string | null {
  const info = ROLE_BY_ID[role];
  return found.length || info.needs === 'also' ? null : `${info.label} added, but there is nothing to attach it to yet`;
}
