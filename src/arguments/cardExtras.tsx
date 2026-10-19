import { useEffect, useRef } from 'react';
import type { DeskItem } from '../studyDesk/types';
import { setPdfDeskTie } from '../studyDesk/pdfDesk';
import { addImplicitNote, armTie, toMargin } from "./actions";
import { implicitFor, type ImplicitRole } from './edit';
import { gaps } from './gaps';
import { ROLE_BY_ID, tagOf } from './roles';
import { setArg, useArg } from './store';

const ADD_LABEL: Record<ImplicitRole, string> = { warrant: '+ Warrant', rebuttal: '+ Exception', backing: '+ Backing' };

/**
 * Under an argument item's words in the margin card: where it points, what is missing, and the actions (add a reader's
 * note, move to the margin, tie to words). Drawn by the study desk's Gloss (MarginLayer.tsx) for any item that has
 * `argument`; renders nothing while the layer is off.
 */
export function ArgumentCardExtras({ item }: { item: DeskItem }) {
  const st = useArg();
  const input = useRef<HTMLInputElement>(null);
  const adding = st.add?.id === item.id ? st.add : null;
  useEffect(() => {
    if (adding) input.current?.focus();
  }, [adding]);
  const a = item.argument;
  if (!a || !st.book) return null;

  const target = a.for ? st.byId.get(a.for) : undefined;
  const flags: string[] = [];
  if (target?.argument) flags.push(`for #${st.nums.get(target.id)} ${tagOf(target.argument)}`);
  for (const g of gaps(st.items)) if (g.ids.includes(item.id)) flags.push(g.title.replace(/s with/, ' with').replace(/s$/, ''));
  const words = !!item.source?.location;
  const own = st.items.find((x) => x.id === item.id);
  const offers = own ? implicitFor(own, st.items) : [];

  return (
    <>
      <div className="sd-gloss__flags arg-flags">
        <span>{words ? `${ROLE_BY_ID[a.role].label} on the page` : a.typed ? 'reader’s note' : 'margin only'}</span>
        {flags.map((f) => (
          <span key={f} className="arg-flag">{f}</span>
        ))}
      </div>
      {a.typed && <div className="arg-note">Not the author’s words.</div>}
      {adding ? (
        <input
          ref={input}
          className="arg-in"
          dir="auto"
          placeholder={`Write the ${ROLE_BY_ID[adding.role].label.toLowerCase()}, then Enter`}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              void addImplicitNote(adding.role, item, e.currentTarget.value);
            } else if (e.key === 'Escape') setArg({ add: null });
          }}
          onBlur={() => setArg({ add: null })}
        />
      ) : (
        <div className="sd-gloss__tools arg-tools">
          {words ? (
            <button type="button" title="Keep the note, drop the highlight on the words" onMouseDown={(e) => e.preventDefault()} onClick={() => void toMargin(item)}>
              To margin
            </button>
          ) : (
            <button type="button" title="Select the words this note belongs to" onMouseDown={(e) => e.preventDefault()} onClick={() => ((item.pin?.location ?? item.source?.location ?? '').startsWith('pdf:') ? setPdfDeskTie(item.id) : armTie(item.id))}>
              Tie to words
            </button>
          )}
          {offers.map((role) => (
            <button key={role} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setArg({ add: { id: item.id, role } })}>
              {ADD_LABEL[role]}
            </button>
          ))}
        </div>
      )}
      {st.tie === item.id && <div className="arg-note">Now select the words this note belongs to</div>}
    </>
  );
}
