import type { ArgumentRole } from './roles';

/** What a margin item (a DeskItem) says about itself in the argument. */
export interface ArgumentFields {
  role: ArgumentRole;
  /** The item this one is for. Null: not attached yet. One target in the first release. */
  for: string | null;
  /** Written by the reader (an implicit note), so it is italic and says "reader's note". */
  typed?: boolean;
}
