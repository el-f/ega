import { makeAsyncLock } from './async-lock';

/** navigator.locks is shared by all extension pages and the SW; tests lack it and use the in-realm lock. */
export function makeCrossContextLock(name: string): <T>(fn: () => Promise<T>) => Promise<T> {
  const realmLock = makeAsyncLock();
  return <T>(fn: () => Promise<T>): Promise<T> =>
    typeof navigator !== 'undefined' && 'locks' in navigator
      ? (navigator.locks.request(name, fn) as Promise<T>)
      : realmLock(fn);
}
