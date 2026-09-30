import { useLookSkin } from './useLookSkin';

/** Renders nothing; mount once inside the preferences provider. */
export function LookSkin() {
  useLookSkin();
  return null;
}
