/** No lone surrogate: JSON.stringify writes one as a `\udXXX` escape, which a provider may reject. */
export const isWellFormed = (s: string): boolean =>
  (s as string & { isWellFormed(): boolean }).isWellFormed();
