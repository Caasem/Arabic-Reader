import type { DeskItem, DeskLink } from '../studyDesk/types';
import { tieOf } from './moves';
import { onPassage } from './passages';

/**
 * A thread's argument, built from the moves tagged on its members (the Argument tab): definitions first, then each
 * claim with its evidence and objections, replies under the objections they answer, open masāʾil placed under the
 * passage they were asked on (where the tension is), and what is not tied yet.
 */

export interface ArgNode {
  item: DeskItem;
  kids: ArgNode[];
  /** Open masāʾil asked on this passage, or tied to it. */
  questions: DeskItem[];
}

export interface Argument {
  definitions: ArgNode[];
  /** Pairs of definitions a Muqābala link says differ. */
  tensions: { link: DeskLink; a: DeskItem; b: DeskItem }[];
  claims: ArgNode[];
  /** Evidence, objections and replies not tied to anything in the thread. */
  loose: ArgNode[];
  /** Open masāʾil that sit under no passage of the argument. */
  questions: DeskItem[];
}

export function buildArgument(members: DeskItem[], byId: Map<string, DeskItem>, links: DeskLink[], isOpen: (q: DeskItem) => boolean): Argument {
  const tagged = members.filter((i) => i.move && !i.droppedAt);
  const inThread = new Set(tagged.map((i) => i.id));
  const openQs = members.filter((i) => i.type === 'question' && isOpen(i));
  const placed = new Set<string>();

  const questionsOn = (item: DeskItem) =>
    openQs.filter((q) => {
      if (placed.has(q.id)) return false;
      const here = q.tie === item.id || (!!q.source?.location && onPassage(q, item));
      if (here) placed.add(q.id);
      return here;
    });

  const seen = new Set<string>();
  const node = (item: DeskItem): ArgNode => {
    seen.add(item.id);
    const kids = tagged.filter((k) => !seen.has(k.id) && tieOf(k, byId)?.id === item.id).map(node);
    return { item, kids, questions: questionsOn(item) };
  };

  const definitions = tagged.filter((i) => i.move === 'definition').map(node);
  const claims = tagged.filter((i) => i.move === 'claim').map(node);
  const loose = tagged
    .filter((i) => !seen.has(i.id))
    .filter((i) => {
      const to = tieOf(i, byId);
      return !to || !inThread.has(to.id);
    })
    .map(node);

  const defs = new Set(definitions.map((d) => d.item.id));
  const tensions = links
    .filter((l) => l.rel === 'differs' && defs.has(l.a) && defs.has(l.b))
    .map((link) => ({ link, a: byId.get(link.a)!, b: byId.get(link.b)! }));

  return { definitions, tensions, claims, loose, questions: openQs.filter((q) => !placed.has(q.id)) };
}
