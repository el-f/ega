/** Drops undefined-valued keys (shallow), for exactOptionalPropertyTypes boundaries. */
export function omitUndef<T extends object>(obj: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const out: Record<string, unknown> = {};
  for (const k in obj) {
    const v = obj[k];
    if (v !== undefined) out[k] = v;
  }
  return out as { [K in keyof T]?: Exclude<T[K], undefined> };
}
