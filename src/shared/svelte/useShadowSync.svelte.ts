/** Writable `$state` mirror of derived data; re-seeds only when `keyOf` changes, so a local write survives. */

interface UseShadowSyncOptions<T> {
  /** Runs inside `$effect`, so every reactive read here is tracked. */
  seed: () => T[];
  /** Stable key over the seeded array — an equal key skips the re-seed. */
  keyOf: (xs: T[]) => string;
}

interface UseShadowSyncResult<T> {
  items: T[];
}

export function useShadowSync<T>(opts: UseShadowSyncOptions<T>): UseShadowSyncResult<T> {
  const initial = opts.seed();
  let items = $state<T[]>(initial);
  let lastKey = opts.keyOf(initial);
  $effect(() => {
    const next = opts.seed();
    const k = opts.keyOf(next);
    if (k === lastKey) return;
    lastKey = k;
    items = next;
  });
  return {
    get items() {
      return items;
    },
    set items(next: T[]) {
      items = next;
      lastKey = opts.keyOf(next);
    },
  };
}
