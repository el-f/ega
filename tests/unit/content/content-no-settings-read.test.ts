// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { chromeMock } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

// The import runs inside the test, after the shared beforeEach resets the chrome mock; a cold import is slow under load.
it('a page never reads the stored settings row, where the API keys live', async () => {
  // The worker answers from memory here, so any read of the row can only come from the page.
  vi.mocked(chromeMock.runtime.sendMessage).mockImplementation((async (m: { kind?: string }) => {
    if (m.kind === 'content:read-settings') return { ...DEFAULT_SETTINGS };
    if (m.kind === 'content:read-languages' || m.kind === 'content:read-tasks') return [];
    return { ok: true };
  }) as never);
  const get = vi.spyOn(chromeMock.storage.local, 'get');

  await import('@/content/index');
  await vi.waitFor(() =>
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ kind: 'content:read-settings' }),
  );

  const reads = get.mock.calls.map((c) => JSON.stringify(c[0] ?? null));
  expect(reads.filter((k) => k.includes(STORAGE_KEYS.settings) || k === 'null')).toEqual([]);
}, 30_000);
