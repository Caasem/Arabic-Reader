import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { setInkUi, useInkUi } from './inkUi';
import { IconPen, IconSketch } from './icons';

/**
 * Write and Sketch in the quiet reader's dock, in the slot it keeps for extras (`#qr-dock-extra`,
 * src/quietReader/Chrome.tsx), after the study desk's buttons. In Focus the dock is hidden; Alt+W and Alt+K
 * still work.
 */
export function InkSwitch() {
  const ui = useInkUi();
  const [slot, setSlot] = useState<{ el: HTMLElement | null; labels: boolean }>({ el: null, labels: false });
  useEffect(() => {
    const check = () =>
      setSlot((s) => {
        const el = document.getElementById('qr-dock-extra');
        const labels = !!document.querySelector('.qr-dock .qr-dock__btn span');
        return s.el === el && s.labels === labels ? s : { el, labels };
      });
    check();
    const t = window.setInterval(check, 500);
    return () => window.clearInterval(t);
  }, []);
  if (!slot.el) return null;
  return createPortal(
    <>
      <span className="qr-dock__sep" aria-hidden="true" />
      <button
        type="button"
        className={'qr-dock__btn' + (ui.inking ? ' qr-dock__btn--on' : '')}
        aria-pressed={ui.inking}
        aria-label="Write on the page"
        title="Write on the page (Alt+W)"
        onClick={() => setInkUi({ inking: !ui.inking })}
      >
        <IconPen size={18} />
        {slot.labels && <span>Write</span>}
      </button>
      <button
        type="button"
        className={'qr-dock__btn' + (ui.sketch ? ' qr-dock__btn--on' : '')}
        aria-pressed={ui.sketch}
        aria-label="Sketch"
        title="Sketch beside this passage (Alt+K)"
        onClick={() => setInkUi({ sketch: !ui.sketch })}
      >
        <IconSketch size={18} />
        {slot.labels && <span>Sketch</span>}
      </button>
    </>,
    slot.el
  );
}
