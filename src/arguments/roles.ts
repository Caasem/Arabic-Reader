export type ArgumentRole =
  | 'claim' | 'grounds' | 'warrant' | 'backing' | 'qualifier' | 'rebuttal' | 'objection' | 'reply';

/** What an item needs to point at: 'also' is an optional claim (a claim that is also grounds for another). */
export type TargetNeed = 'also' | 'claim' | 'grounds' | 'warrant' | 'objection';

export interface RoleInfo {
  id: ArgumentRole;
  /** The number key that applies the role. */
  key: string;
  /** What the UI calls it (Toulmin's rebuttal is "Exception"). */
  label: string;
  needs: TargetNeed;
}

export const ROLES: readonly RoleInfo[] = [
  { id: 'claim', key: '1', label: 'Claim', needs: 'also' },
  { id: 'grounds', key: '2', label: 'Grounds', needs: 'claim' },
  { id: 'warrant', key: '3', label: 'Warrant', needs: 'grounds' },
  { id: 'backing', key: '4', label: 'Backing', needs: 'warrant' },
  { id: 'qualifier', key: '5', label: 'Qualifier', needs: 'grounds' },
  { id: 'rebuttal', key: '6', label: 'Exception', needs: 'grounds' },
  { id: 'objection', key: '7', label: 'Objection', needs: 'claim' },
  { id: 'reply', key: '8', label: 'Reply', needs: 'objection' },
];

export const ROLE_BY_ID: Readonly<Record<ArgumentRole, RoleInfo>> = Object.fromEntries(
  ROLES.map((r) => [r.id, r]),
) as Record<ArgumentRole, RoleInfo>;

/** Roles drawn as boxes on the sheet; the rest sit on arrows. */
export const BOX_ROLES: readonly ArgumentRole[] = ['claim', 'grounds', 'objection', 'reply'];

export const isBoxRole = (role: ArgumentRole): boolean => BOX_ROLES.includes(role);

/**
 * One argument item. `spot` is its place in reading order (the start of its words, or the pin of a
 * margin-only item); the caller derives it from the item's location.
 */
export interface ArgItem {
  id: string;
  role: ArgumentRole;
  /** The item this one is for. Null: not attached. */
  for: string | null;
  spot: number;
  /** Margin-only (an implicit note, or a highlight moved to the margin): no words on the page. */
  marginOnly?: boolean;
}

export const roleForKey = (key: string): ArgumentRole | null => ROLES.find((r) => r.key === key)?.id ?? null;

/** A claim with a target also plays grounds. Derived, never stored. */
export const rolesOf = (n: Pick<ArgItem, 'role' | 'for'>): ArgumentRole[] =>
  n.role === 'claim' && n.for ? ['claim', 'grounds'] : [n.role];

export const tagOf = (n: Pick<ArgItem, 'role' | 'for'>): string =>
  n.role === 'claim' && n.for ? 'Claim · Grounds' : ROLE_BY_ID[n.role].label;

/** A step is a grounds, or a claim that has a target. */
export const isStep = (n: Pick<ArgItem, 'role' | 'for'>): boolean =>
  n.role === 'grounds' || (n.role === 'claim' && !!n.for);

export type LinkType = 'grounds' | 'attacks' | 'replies';

/** The link an item makes to its target, or null when it makes none (warrant, backing, qualifier, exception, or untargeted). */
export function linkTypeOf(n: Pick<ArgItem, 'role' | 'for'>): LinkType | null {
  if (!n.for) return null;
  if (n.role === 'grounds' || n.role === 'claim') return 'grounds';
  if (n.role === 'objection') return 'attacks';
  if (n.role === 'reply') return 'replies';
  return null;
}

/** Numbers `#1`, `#2`… in reading order. Ties keep the order the items were given in. */
export function numbering(items: readonly ArgItem[]): Map<string, number> {
  const sorted = items.map((n, i) => ({ n, i })).sort((a, b) => a.n.spot - b.n.spot || a.i - b.i);
  return new Map(sorted.map(({ n }, k) => [n.id, k + 1]));
}
