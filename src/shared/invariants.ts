/** Exhaustiveness guard: adding a union variant breaks the compile at every call site. */
export function assertNever(x: never): never {
  throw new Error(`assertNever: unexpected value ${JSON.stringify(x)}`);
}

export function invariant(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`[ega.invariant] ${msg}`);
}
