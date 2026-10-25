import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { bundledHostSource, EXPECTED_HOST_VERSION } from '@/options/nativeHostInstall';
import {
  LOCK_URL,
  currentLock,
  hostSourceHash,
  nextLock,
  type HostLock,
} from '../../../scripts/host-version-lock.mjs';

describe('native-host/host-version.lock.json', () => {
  // The host the extension ships, not a second read of the files.
  const current: HostLock = {
    hostVersion: EXPECTED_HOST_VERSION,
    sha256: hostSourceHash(bundledHostSource),
  };
  const lock = JSON.parse(readFileSync(LOCK_URL, 'utf8')) as HostLock;

  it('matches the bundled host, so a host change cannot ship under the old HOST_VERSION', () => {
    const verdict = nextLock(current, lock, false);
    if ('error' in verdict) throw new Error(verdict.error);
    expect(current, 'the lock is out of date: run pnpm host:lock').toEqual(lock);
  });

  it('pnpm host:lock hashes the same files the extension bundles', () => {
    expect(currentLock(), 'scripts/host-version-lock.mjs reads a different file list').toEqual(
      current,
    );
  });
});

describe('nextLock', () => {
  const v5 = { hostVersion: 5, sha256: 'a' };

  it('refuses a new hash under the old version and names the command', () => {
    const r = nextLock({ hostVersion: 5, sha256: 'b' }, v5, false);
    expect('error' in r && r.error).toMatch(/HOST_VERSION is still 5[\s\S]*Run: pnpm host:lock/i);
  });

  it('accepts a bump, an unchanged host, a first lock and an explicit --same-version', () => {
    const bumped = { hostVersion: 6, sha256: 'b' };
    expect(nextLock(bumped, v5, false)).toEqual({ lock: bumped });
    expect(nextLock(v5, v5, false)).toEqual({ lock: v5 });
    expect(nextLock(v5, null, false)).toEqual({ lock: v5 });
    const same = { hostVersion: 5, sha256: 'b' };
    expect(nextLock(same, v5, true)).toEqual({ lock: same });
  });

  it('ignores line endings', () => {
    expect(hostSourceHash('a\r\nb\n')).toBe(hostSourceHash('a\nb\n'));
  });
});
