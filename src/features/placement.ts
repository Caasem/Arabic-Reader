import type { FeatureDescriptor, SettingsGroupId } from './registry';

/**
 * The order of one Settings group's sections, by key: the group's own (core) sections as listed, with each feature's
 * section placed right after its `settingsAfter` key (after any feature placed there before it), or at the group's
 * end. Features are taken in registry order.
 */
export function sectionOrder(group: SettingsGroupId, coreKeys: string[], features: readonly FeatureDescriptor[]): string[] {
  const order = [...coreKeys];
  const lastAfter = new Map<string, string>();
  for (const f of features) {
    if (!f.SettingsSection || f.settingsGroup !== group) continue;
    const anchor = f.settingsAfter;
    const at = anchor ? order.indexOf(lastAfter.get(anchor) ?? anchor) : -1;
    if (at === -1) order.push(f.id);
    else order.splice(at + 1, 0, f.id);
    if (anchor) lastAfter.set(anchor, f.id);
  }
  return order;
}
