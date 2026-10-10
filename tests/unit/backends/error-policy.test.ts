import { describe, it, expect } from 'vitest';
import {
  ERR_POLICY,
  shouldRotate,
  isRetryable,
  optionsTabForMessage,
  type ErrPolicy,
} from '@/shared/error-policy';
import { ALL_ERR_CODES, type ErrCode } from '@/shared/types';
import { SETTINGS_TABS } from '@/shared/settings-tabs';

describe('ERR_POLICY — orthogonal retryable / rotate table', () => {
  // retryable = the SAME provider is worth another attempt; rotate = the NEXT backend is.
  const TABLE: Record<ErrCode, ErrPolicy> = {
    NETWORK: { retryable: true, rotate: true },
    SERVER: { retryable: true, rotate: true },
    EMPTY: { retryable: true, rotate: true },
    RATE_LIMIT: { retryable: true, rotate: true },
    TIMEOUT: { retryable: true, rotate: true },
    AUTH: { retryable: false, rotate: true, optionsTab: 'backends' },
    QUOTA: { retryable: false, rotate: true, optionsTab: 'backends' },
    NATIVE_NOT_INSTALLED: { retryable: false, rotate: true, optionsTab: 'backends' },
    NATIVE_SPAWN_FAIL: { retryable: false, rotate: true, optionsTab: 'backends' },
    NO_BACKEND: { retryable: false, rotate: false, optionsTab: 'backends' },
    REQUEST: { retryable: false, rotate: false },
    PARSE: { retryable: true, rotate: true, maxAttempts: 2 },
    PROTOCOL: { retryable: true, rotate: true },
    UNSUPPORTED: { retryable: false, rotate: false, optionsTab: 'backends' },
    IMAGE_UNSUPPORTED: { retryable: false, rotate: false },
    ABORTED: { retryable: false, rotate: false },
    UNKNOWN: { retryable: false, rotate: false },
  };

  it('covers every ErrCode exactly once', () => {
    expect(Object.keys(ERR_POLICY).sort()).toEqual([...ALL_ERR_CODES].sort());
  });

  for (const code of ALL_ERR_CODES) {
    it(`${code}: retryable=${TABLE[code].retryable} rotate=${TABLE[code].rotate}`, () => {
      expect(ERR_POLICY[code]).toEqual(TABLE[code]);
      expect(isRetryable(code)).toBe(TABLE[code].retryable);
      expect(shouldRotate(code)).toBe(TABLE[code].rotate);
    });
  }

  it('REQUEST (400/422, content-policy) never rotates — same prompt re-fails everywhere', () => {
    expect(shouldRotate('REQUEST')).toBe(false);
  });

  it('AUTH rotates but is not retryable — a different backend key may work', () => {
    expect(shouldRotate('AUTH')).toBe(true);
    expect(isRetryable('AUTH')).toBe(false);
  });

  it('ABORTED neither rotates nor retries — user canceled', () => {
    expect(shouldRotate('ABORTED')).toBe(false);
    expect(isRetryable('ABORTED')).toBe(false);
  });

  it('NO_BACKEND neither rotates nor retries — there is nothing configured to try', () => {
    expect(shouldRotate('NO_BACKEND')).toBe(false);
    expect(isRetryable('NO_BACKEND')).toBe(false);
  });

  it('PROTOCOL (truncated stream) retries and rotates — the drop is transient, so surfaces show Retry', () => {
    expect(isRetryable('PROTOCOL')).toBe(true);
    expect(shouldRotate('PROTOCOL')).toBe(true);
  });

  it('UNKNOWN stays non-retryable — an unclassified failure must not spend a second call', () => {
    expect(isRetryable('UNKNOWN')).toBe(false);
    expect(isRetryable('UNKNOWN', 1)).toBe(false);
    expect(ERR_POLICY.UNKNOWN.maxAttempts).toBeUndefined();
  });
});

describe('isRetryable — per-code attempt ceiling', () => {
  it('PARSE is retryable on the first failure', () => {
    expect(isRetryable('PARSE')).toBe(true);
    expect(isRetryable('PARSE', 1)).toBe(true);
  });

  it('PARSE stops after one extra attempt', () => {
    expect(isRetryable('PARSE', 2)).toBe(false);
    expect(isRetryable('PARSE', 3)).toBe(false);
  });

  it('a code with no ceiling stays retryable however many attempts were made', () => {
    expect(isRetryable('NETWORK', 9)).toBe(true);
    expect(isRetryable('PROTOCOL', 9)).toBe(true);
  });

  it('the ceiling never makes a non-retryable code retryable', () => {
    expect(isRetryable('AUTH', 1)).toBe(false);
    expect(isRetryable('REQUEST', 1)).toBe(false);
  });

  it('only PARSE carries a ceiling — every other retryable code is bounded by its caller', () => {
    const bounded = ALL_ERR_CODES.filter((c) => ERR_POLICY[c].maxAttempts !== undefined);
    expect(bounded).toEqual(['PARSE']);
  });
});

describe('the options tab per code — one map for every surface that offers "Open settings"', () => {
  const TAB_IDS = new Set<string>(SETTINGS_TABS.map((t) => t.id));

  it('every row that names a tab names a real one', () => {
    for (const code of ALL_ERR_CODES) {
      const tab = optionsTabForMessage('', code);
      if (tab === undefined) continue;
      expect(TAB_IDS.has(tab)).toBe(true);
    }
  });

  it('sends every backend-configuration failure to Backends', () => {
    for (const code of [
      'AUTH',
      'QUOTA',
      'NATIVE_NOT_INSTALLED',
      'NATIVE_SPAWN_FAIL',
      'NO_BACKEND',
      'UNSUPPORTED',
    ] as const) {
      expect(optionsTabForMessage('', code)).toBe('backends');
    }
  });

  it('offers no settings tab for an image no setting can fix', () => {
    expect(optionsTabForMessage('', 'IMAGE_UNSUPPORTED')).toBeUndefined();
    // The backend-side UNSUPPORTED (no vision model configured) still points at Backends.
    expect(optionsTabForMessage('', 'UNSUPPORTED')).toBe('backends');
  });

  it('routes by labels that still exist in SETTINGS_TABS', async () => {
    const { SETTINGS_TABS } = await import('@/shared/settings-tabs');
    for (const [label, id] of [
      ['Answers', 'translate'],
      ['Backends', 'backends'],
    ] as const) {
      const row = SETTINGS_TABS.find((t) => t.id === id);
      expect(row?.label, `${id} tab is gone`).toBe(label);
      expect(optionsTabForMessage(`Fix it in Settings → ${label}.`, null)).toBe(id);
    }
  });

  it('an old stored message that names the Translate tab still opens its new name, Answers', () => {
    expect(optionsTabForMessage('Raise it in Settings → Translate.', 'TIMEOUT')).toBe('translate');
  });

  it('leaves REQUEST to its message — one code covers three unrelated causes', () => {
    expect(optionsTabForMessage('', 'REQUEST')).toBeUndefined();
    expect(
      optionsTabForMessage('Reply hit the cap. Raise it in Settings → Translate.', 'REQUEST'),
    ).toBe('translate');
    expect(
      optionsTabForMessage('That model id is unknown. Pick one in Settings → Backends.', 'REQUEST'),
    ).toBe('backends');
    expect(optionsTabForMessage('The request was too large.', 'REQUEST')).toBeUndefined();
  });

  it('offers no tab for a failure no setting can fix', () => {
    for (const code of [
      'NETWORK',
      'SERVER',
      'RATE_LIMIT',
      'TIMEOUT',
      'PARSE',
      'PROTOCOL',
      'ABORTED',
      'UNKNOWN',
    ] as const) {
      expect(optionsTabForMessage('', code)).toBeUndefined();
    }
  });
});
