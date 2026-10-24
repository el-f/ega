export interface HostLock {
  hostVersion: number;
  sha256: string;
}
export const LOCK_URL: URL;
export function hostSourceHash(source: string): string;
export function nextLock(
  current: HostLock,
  previous: HostLock | null,
  sameVersion: boolean,
): { lock: HostLock } | { error: string };
