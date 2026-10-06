import { beforeEach, describe, expect, it } from 'vitest';
import { resetChromeMock } from '@tests/mocks/chrome';
import {
  BACKEND_VERIFIED_KEY,
  clearVerified,
  markVerified,
  readVerified,
} from '@/options/backend-verified';
import { asBackendIdUnsafe } from '@/shared/brands';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { clearAllStorage, getSettings, updateSettings } from '@/shared/storage';
import { exportAll } from '@/shared/storage/backup';
import type { Settings } from '@/shared/types';

const anthropic = asBackendIdUnsafe('anthropic');
const gemini = asBackendIdUnsafe('gemini');
const withKeys: Settings = { ...DEFAULT_SETTINGS, anthropicApiKey: 'sk-a', geminiApiKey: 'g-1' };

describe('backend verified state (T-R5)', () => {
  beforeEach(() => resetChromeMock());

  it('survives a reload: a later read with the same key still says verified, with its time', async () => {
    await markVerified(anthropic, withKeys, 1_000);
    expect(await readVerified(anthropic, withKeys)).toBe(1_000);
  });

  it('a new key or a new model reads as not verified, with no write needed', async () => {
    await markVerified(anthropic, withKeys, 1_000);
    expect(await readVerified(anthropic, { ...withKeys, anthropicApiKey: 'sk-b' })).toBeNull();
    const otherModel = { ...withKeys, model: { ...withKeys.model, anthropic: 'claude-other' } };
    expect(await readVerified(anthropic, otherModel)).toBeNull();
  });

  it('stores no key text, and a write drops rows whose key changed', async () => {
    await markVerified(gemini, withKeys, 1);
    await markVerified(anthropic, { ...withKeys, geminiApiKey: 'g-2' }, 2);
    const stored = (await chrome.storage.local.get(BACKEND_VERIFIED_KEY))[BACKEND_VERIFIED_KEY];
    expect(Object.keys(stored as object)).toEqual(['anthropic']);
    expect(JSON.stringify(stored)).not.toContain('sk-a');
  });

  it('a failed test clears the mark', async () => {
    await markVerified(anthropic, withKeys, 1);
    await clearVerified(anthropic);
    expect(await readVerified(anthropic, withKeys)).toBeNull();
  });

  it('is left out of Export all settings and goes with Delete all data', async () => {
    await updateSettings({ anthropicApiKey: 'sk-a' });
    await markVerified(anthropic, await getSettings(), 1);
    expect(JSON.stringify(await exportAll({ includeApiKeys: true }))).not.toContain(
      BACKEND_VERIFIED_KEY,
    );
    await clearAllStorage();
    expect(
      (await chrome.storage.local.get(BACKEND_VERIFIED_KEY))[BACKEND_VERIFIED_KEY],
    ).toBeUndefined();
  });

  it('reads a malformed stored value as nothing verified', async () => {
    await chrome.storage.local.set({ [BACKEND_VERIFIED_KEY]: ['bad'] });
    expect(await readVerified(anthropic, withKeys)).toBeNull();
  });
});
