import { useEffect, useState } from 'react';
import { hiddenFor, type SketchCardRef } from './sketchCards';
import { sketchSvg } from './toMargin';
import type { Sketch } from './types';

/**
 * A sketch card in the review screen (components/review/Review.tsx): the sheet drawn as a picture, the occluded
 * label left blank on the front and shown on the back. Loaded on demand, so the review screen does not carry the
 * sheet drawing code until a sheet card comes up.
 */
export default function SketchCardFigure({ sketch, card, side }: { sketch: Sketch; card: SketchCardRef; side: 'front' | 'back' }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([sketchSvg(sketch, { hide: hiddenFor(card, side) }).svg], { type: 'image/svg+xml' }));
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [sketch, card, side]);
  return <div className="review__sheet">{src && <img src={src} alt={side === 'front' ? 'The sheet with one label hidden' : 'The sheet'} draggable={false} />}</div>;
}
