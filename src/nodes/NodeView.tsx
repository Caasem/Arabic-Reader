import type { CSSProperties } from 'react';
import { IconAddNode, IconAddNote, IconCarry, IconChevron, IconPin, IconSwap, IconTrash, IconUnlink, KindIcon } from './icons';
import { floatedNodes, growSide, layoutBranch } from './layout';
import { countBelow } from './model';
import type { CardKid, NodeKid } from './types';

/**
 * What a node looks like. Presentational only: it draws the tree it is given and marks every control with a data
 * attribute (`data-nx-*`); NodesLayer does the listening. Two ways to open, chosen per node:
 * - reticle: a side panel with an outline of what is attached;
 * - branch: a tree growing away from the nearer page edge.
 * Either can hold the other (a reticle inside a branch opens as a panel at its dot; a branch inside a panel is a
 * tree-like list). Everything is positioned from the node's own dot at (0, 0).
 */

export interface ViewCtx {
  /** The layer's size, to decide which way things grow and whether a panel opens up or down. */
  width: number;
  height: number;
  /** Show the controls that change a node (switch style, attach, detach, delete). */
  controls: boolean;
  /** Show the carry control on top-level nodes. */
  carry: boolean;
  /** The node, or the open panel of one, a dragged node or card is over right now. */
  drop: { id: string; part: 'dot' | 'panel' } | null;
}

const at = (x: number, y: number): CSSProperties => ({ left: Math.round(x * 10) / 10, top: Math.round(y * 10) / 10 });

// ---- pieces ---------------------------------------------------------------------------------------------

function Dot({ k, top, ctx }: { k: NodeKid; top: boolean; ctx: ViewCtx }) {
  const n = k.node;
  const c = countBelow(k);
  return (
    <button
      type="button"
      className={`nx-dot nx-st-${n.style}${n.open ? ' is-open' : ''}${c ? ' has' : ''}${ctx.drop?.id === n.id && ctx.drop.part === 'dot' ? ' nx-drop' : ''}`}
      data-nx-dot={n.id}
      data-nx-top={top ? '1' : undefined}
      aria-expanded={n.open}
      aria-label={`${n.title}, ${c} attached`}
    >
      <i className="nx-ring" />
      <i className="nx-core" />
    </button>
  );
}

function Title({ k }: { k: NodeKid }) {
  return (
    <b className="nx-ttl" contentEditable suppressContentEditableWarning spellCheck={false} data-nx-title={k.node.id}>
      {k.node.title}
    </b>
  );
}

/** The buttons beside a title. The pin is always there; the rest show on an open node, where the title row has room. */
function Acts({ k, ctx, pin = true }: { k: NodeKid; ctx: ViewCtx; pin?: boolean }) {
  const n = k.node;
  const to = n.style === 'reticle' ? 'Branch' : 'Reticle';
  return (
    <>
      {ctx.controls && n.open && (
        <>
          <button type="button" className="nx-btn" data-nx-style={n.id} aria-label={`Switch to ${to}`} title={`Switch to ${to}`}>
            <IconSwap />
          </button>
          <button type="button" className="nx-btn" data-nx-add="note" data-nx-for={n.id} aria-label="Attach a note" title="Attach a note">
            <IconAddNote />
          </button>
          <button type="button" className="nx-btn" data-nx-add="node" data-nx-for={n.id} aria-label="Attach a branch" title="Attach a branch">
            <IconAddNode />
          </button>
          {n.parentId !== null ? (
            <button type="button" className="nx-btn" data-nx-detach={n.id} aria-label="Detach from its parent" title="Detach from its parent (or Alt-drag it)">
              <IconUnlink />
            </button>
          ) : ctx.carry ? (
            <button type="button" className="nx-btn" data-nx-carry={n.id} aria-pressed={!!n.carried} aria-label="Carry across pages" title={n.carried ? 'Stop carrying' : 'Carry across pages'}>
              <IconCarry />
            </button>
          ) : null}
          <button type="button" className="nx-btn" data-nx-remove={n.id} aria-label="Delete this node" title="Delete this node and what is attached to it">
            <IconTrash />
          </button>
        </>
      )}
      {pin && (
        <button type="button" className="nx-btn" data-nx-pin={n.id} aria-pressed={n.pinTitle} aria-label="Keep the title visible" title="Keep the title visible">
          <IconPin />
        </button>
      )}
    </>
  );
}

type LabelSide = 'r' | 'l' | 't' | 'b' | 'tr' | 'tl';

function Label({ k, side, ctx }: { k: NodeKid; side: LabelSide; ctx: ViewCtx }) {
  const n = k.node;
  return (
    <span className={`nx-lb nx-st-${n.style} nx-s-${side}${n.open || n.pinTitle ? ' show' : ''}`}>
      <Title k={k} />
      <em>{countBelow(k)}</em>
      <Acts k={k} ctx={ctx} />
    </span>
  );
}

function Card({ card, x, y, side }: { card: CardKid['card']; x: number; y: number; side: 'r' | 'l' }) {
  return (
    <div className={`nx-it nx-s-${side} nx-k-${card.kind}`} data-nx-card={card.id} style={at(x, y)} title={card.text}>
      <span className="nx-chip">
        <KindIcon kind={card.kind} />
      </span>
      <span className="nx-tx" dir="auto" data-nx-text={card.id}>
        {card.text}
      </span>
    </div>
  );
}

// ---- the reticle panel ----------------------------------------------------------------------------------

function Outline({ k, br, ctx }: { k: NodeKid; br: boolean; ctx: ViewCtx }) {
  const cls = 'nx-tr' + (br ? ' nx-br' : '');
  if (!k.kids.length) {
    return (
      <ul className={cls}>
        <li className="nx-row nx-empty">Nothing attached yet</li>
      </ul>
    );
  }
  return (
    <ul className={cls}>
      {k.kids.map((c) => {
        if (c.type === 'card') {
          return (
            <li key={c.card.id} className={`nx-row nx-item nx-k-${c.card.kind}`} data-nx-card={c.card.id}>
              <span className="nx-chip">
                <KindIcon kind={c.card.kind} />
              </span>
              <span className="nx-tx" dir="auto" data-nx-text={c.card.id}>
                {c.card.text}
              </span>
            </li>
          );
        }
        if (c.node.off) {
          return (
            <li key={c.node.id} className="nx-row nx-float" title="Spaced out on the page. Drop it back on this panel to return it.">
              <span className="nx-chip">{'↗'}</span>
              <span className="nx-tx">{c.node.title}</span>
            </li>
          );
        }
        return (
          <li key={c.node.id} className="nx-row">
            <div className="nx-rh">
              <button type="button" className="nx-chev" data-nx-dot={c.node.id} aria-expanded={c.node.open} aria-label={`${c.node.open ? 'Collapse' : 'Open'} ${c.node.title}`}>
                <IconChevron />
              </button>
              <Dot k={c} top={false} ctx={ctx} />
              <Title k={c} />
              <em>{countBelow(c)}</em>
              <Acts k={c} ctx={ctx} pin={false} />
            </div>
            {c.node.open && <Outline k={c} br={c.node.style === 'branch'} ctx={ctx} />}
          </li>
        );
      })}
    </ul>
  );
}

function ReticleNode({ k, ax, ay, top, ctx }: { k: NodeKid; ax: number; ay: number; top: boolean; ctx: ViewCtx }) {
  const side = growSide(ax, ctx.width);
  const dir = side === 1 ? 'r' : 'l';
  const up = ay > ctx.height * 0.6;
  const floats = floatedNodes(k);
  return (
    <>
      {floats.length > 0 && (
        <svg className="nx-ln" viewBox="-420 -420 840 840" aria-hidden="true">
          {floats.map((f) => (
            <line key={f.node.id} className="t" x1={0} y1={0} x2={f.node.off!.x} y2={f.node.off!.y} />
          ))}
        </svg>
      )}
      <div className="nx-nw">
        <Dot k={k} top={top} ctx={ctx} />
        {!k.node.open && <Label k={k} side={dir} ctx={ctx} />}
        {k.node.open && (
          <div className={`nx-pn nx-${dir} ${up ? 'up' : 'dn'}${ctx.drop?.id === k.node.id && ctx.drop.part === 'panel' ? ' nx-drop' : ''}`} data-nx-owner={k.node.id}>
            <div className="nx-ph">
              <Title k={k} />
              <em>{countBelow(k)}</em>
              <Acts k={k} ctx={ctx} />
            </div>
            <Outline k={k} br={false} ctx={ctx} />
          </div>
        )}
      </div>
      {floats.map((f) => (
        <div key={f.node.id} className="nx-fl" style={at(f.node.off!.x, f.node.off!.y)}>
          <Placed k={f} ax={ax + f.node.off!.x} ay={ay + f.node.off!.y} top={false} ctx={ctx} />
        </div>
      ))}
    </>
  );
}

// ---- the branch tree ------------------------------------------------------------------------------------

function BranchNode({ k, ax, ay, top, ctx }: { k: NodeKid; ax: number; ay: number; top: boolean; ctx: ViewCtx }) {
  const side = growSide(ax, ctx.width);
  const placed = layoutBranch(k, side);
  const cardSide = side === 1 ? 'r' : 'l';
  // Above the dot, reaching toward the side the tree grows, so a node near a page edge keeps its title.
  const labelSide: LabelSide = side === 1 ? 'tr' : 'tl';
  const lines = placed.flatMap((p) => {
    if (p.parent === null) return [];
    const from = placed[p.parent];
    const x1 = from.x + side * 9;
    const x2 = p.x - side * (p.kid.type === 'card' ? 1 : 9);
    const xm = (x1 + x2) / 2;
    const r = (n: number) => Math.round(n * 10) / 10;
    return [
      <path
        key={p.kid.type === 'card' ? p.kid.card.id : p.kid.node.id}
        className={p.kid.type === 'card' ? 'i' : 'n'}
        d={`M${r(x1)} ${r(from.y)} C${r(xm)} ${r(from.y)} ${r(xm)} ${r(p.y)} ${r(x2)} ${r(p.y)}`}
      />,
    ];
  });
  return (
    <>
      <svg className="nx-ln" viewBox="-420 -420 840 840" aria-hidden="true">
        {lines}
      </svg>
      {placed.slice(1).map((p) => {
        if (p.kid.type === 'card') return <Card key={p.kid.card.id} card={p.kid.card} x={p.x} y={p.y} side={cardSide} />;
        const kid = p.kid;
        return (
          <div key={kid.node.id} className="nx-at" style={at(p.x, p.y)}>
            {kid.node.style === 'reticle' ? (
              <ReticleNode k={kid} ax={ax + p.x} ay={ay + p.y} top={false} ctx={ctx} />
            ) : (
              <div className="nx-nw">
                <Dot k={kid} top={false} ctx={ctx} />
                <Label k={kid} side={labelSide} ctx={ctx} />
              </div>
            )}
          </div>
        );
      })}
      <div className="nx-nw">
        <Dot k={k} top={top} ctx={ctx} />
        <Label k={k} side={labelSide} ctx={ctx} />
      </div>
    </>
  );
}

function Placed({ k, ax, ay, top, ctx }: { k: NodeKid; ax: number; ay: number; top: boolean; ctx: ViewCtx }) {
  return k.node.style === 'reticle' ? <ReticleNode k={k} ax={ax} ay={ay} top={top} ctx={ctx} /> : <BranchNode k={k} ax={ax} ay={ay} top={top} ctx={ctx} />;
}

/** One top-level node and everything attached to it, with its dot at (x, y) in the layer. */
export function NodeGroup({ root, x, y, ctx, dragging = false }: { root: NodeKid; x: number; y: number; ctx: ViewCtx; dragging?: boolean }) {
  return (
    <div className={'nx-grp' + (root.node.open ? ' is-on' : '') + (dragging ? ' is-dragging' : '')} data-nx-root={root.node.id} style={at(x, y)}>
      <Placed k={root} ax={x} ay={y} top ctx={ctx} />
    </div>
  );
}
