/** The dictionaries that are off and match what was typed (name, case-insensitive), in the user's order. */
export function matchOffProviders<T extends { id: string; name: string }>(providers: T[], enabledIds: readonly string[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return providers.filter((p) => !enabledIds.includes(p.id) && (!q || p.name.toLowerCase().includes(q)));
}
