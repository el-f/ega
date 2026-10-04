import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isExtensionContextValid,
  isContextInvalidatedError,
  CONTEXT_INVALIDATED_MESSAGE,
} from '@/content/context-guard';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isExtensionContextValid', () => {
  it('true when chrome.runtime.id is present', () => {
    expect(isExtensionContextValid()).toBe(true); // mock provides runtime.id
  });

  it('false when chrome.runtime.id is absent (invalidated)', () => {
    vi.stubGlobal('chrome', { runtime: { id: undefined } });
    expect(isExtensionContextValid()).toBe(false);
  });

  it('false when reading chrome.runtime throws', () => {
    vi.stubGlobal('chrome', {
      get runtime(): never {
        throw new Error('Extension context invalidated.');
      },
    });
    expect(isExtensionContextValid()).toBe(false);
  });
});

describe('isContextInvalidatedError', () => {
  it('true for the chrome invalidation Error', () => {
    expect(isContextInvalidatedError(new Error('Extension context invalidated.'))).toBe(true);
  });

  it('true for the message as a string (case-insensitive)', () => {
    expect(isContextInvalidatedError('Extension Context Invalidated')).toBe(true);
  });

  it('false for an unrelated error', () => {
    expect(isContextInvalidatedError(new Error('network timeout'))).toBe(false);
    expect(isContextInvalidatedError(undefined)).toBe(false);
    expect(isContextInvalidatedError(null)).toBe(false);
  });
});

describe('CONTEXT_INVALIDATED_MESSAGE', () => {
  it('mentions reloading the page', () => {
    expect(CONTEXT_INVALIDATED_MESSAGE.toLowerCase()).toContain('reload');
  });
});
