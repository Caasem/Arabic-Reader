import { getDesk, saveDeskHtml } from '../../studyDesk/deskStore';
import type { Desk, DeskItem } from '../../studyDesk/types';
import { buildArgument, type ArgNode } from '../argument';
import { draftBlocks, withDraft } from '../draft';
import { wordsOf } from '../labels';
import { isOpen } from '../masail';
import { moveInfo } from '../moves';
import { citeOf, dateLabel, isPassage, isThought, thoughtText } from '../passages';
import { say } from '../say';
import { threadMembers } from '../threads';
import type { ThinkingData } from '../useThinkingData';

/**
 * The thread's argument, from the moves tagged on its members: definitions, claims and what bears on them. "Draft from
 * the argument" writes it into the thread's Document as an outline (draft.ts), with Undo.
 */
export function ArgumentTab({
  thread,
  data,
  onGoTo,
  onDrafted,
  onUndone,
}: {
  thread: Desk;
  data: ThinkingData;
  onGoTo(item: DeskItem): void;
  onDrafted(): void;
  onUndone(): void;
}) {
  const members = threadMembers(thread.id, data.items);
  const arg = buildArgument(members, data.byId, (q) => isOpen(q, data.byId));
  const empty = !arg.definitions.length && !arg.claims.length && !arg.loose.length;
  const draft = async () => {
    // The document as saved now (the editor saves quietly, so the list of desks may be a step behind).
    const before = (await getDesk(thread.id))?.html ?? thread.html;
    await saveDeskHtml(thread.id, withDraft(before, draftBlocks(arg, members), dateLabel(Date.now())));
    say('Draft written to the Document', async () => {
      await saveDeskHtml(thread.id, before);
      onUndone();
    });
    onDrafted();
  };
  return (
    <div className="th-amap">
      {!empty && (
        <div className="th-row th-amap__draft">
          <button type="button" className="sd-btn" onClick={() => void draft()}>
            Draft from the argument
          </button>
          <span className="th-faint">Writes an outline into the Document: your claims, with what supports and resists them.</span>
        </div>
      )}
      {empty && <p className="th-empty">No moves in this thread yet. Click a passage’s handle while reading and name what it is doing (keys 1–5).</p>}
      {arg.definitions.length > 0 && <h3 className="th-amap__h">Definitions</h3>}
      {arg.definitions.map((n) => (
        <Node key={n.item.id} node={n} onGoTo={onGoTo} />
      ))}
      {arg.claims.length > 0 && <h3 className="th-amap__h">Claims, with what supports and resists them</h3>}
      {arg.claims.map((n) => (
        <Node key={n.item.id} node={n} onGoTo={onGoTo} />
      ))}
      {arg.loose.length > 0 && <h3 className="th-amap__h">Not tied yet</h3>}
      {arg.loose.map((n) => (
        <Node key={n.item.id} node={n} onGoTo={onGoTo} />
      ))}
      {arg.questions.length > 0 && <h3 className="th-amap__h">Open masāʾil</h3>}
      {arg.questions.map((q) => (
        <p key={q.id} className="th-tension th-tension--q" dir="auto">
          {wordsOf(q)}
        </p>
      ))}
    </div>
  );
}

function Node({ node, onGoTo }: { node: ArgNode; onGoTo(item: DeskItem): void }) {
  const { item } = node;
  const m = moveInfo(item.move!);
  const mine = !isPassage(item);
  return (
    <div className="th-anode-wrap">
      <div className={'th-anode' + (mine ? ' th-anode--yours' : '')} data-m={m.id}>
        <div className="th-sig">
          <span className="th-ar">{m.ar}</span>
          <small>{m.en}</small>
        </div>
        <div className="th-anode__body">
          <p className={item.ar ? 'th-ar th-anode__text' : 'th-anode__text'} dir="auto">
            {isThought(item) ? thoughtText(item) : item.text}
          </p>
          <p className="th-line__meta">
            {mine ? <span className="th-kind th-kind--note">Your {m.en.toLowerCase()}</span> : <bdi>{citeOf(item)}</bdi>}
            {item.source?.location && (
              <button type="button" className="th-link" onClick={() => onGoTo(item)}>
                Open page ↗
              </button>
            )}
          </p>
        </div>
      </div>
      {(node.kids.length > 0 || node.questions.length > 0) && (
        <div className="th-kids">
          {node.questions.map((q) => (
            <p key={q.id} className="th-tension th-tension--q" dir="auto">
              Open masʾala sits here: {wordsOf(q)}
            </p>
          ))}
          {node.kids.map((k) => (
            <Node key={k.item.id} node={k} onGoTo={onGoTo} />
          ))}
        </div>
      )}
    </div>
  );
}
