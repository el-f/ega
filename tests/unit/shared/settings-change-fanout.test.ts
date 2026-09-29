import { describe, it, expect, vi } from 'vitest';
import { chromeMock } from '@tests/mocks/chrome';
import { onSettingsChanged } from '@/shared/storage';
import { STORAGE_KEYS } from '@/shared/constants';

function fireSettingsChange(): void {
  chromeMock.storage.local._fire({ [STORAGE_KEYS.settings]: { newValue: {} } });
}

function settingsReads(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.filter((c) => c[0] === STORAGE_KEYS.settings).length;
}

describe('onSettingsChanged fan-out', () => {
  it('reads the stored row once per change, not once per subscriber', async () => {
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    const unsubs = [onSettingsChanged(a), onSettingsChanged(b), onSettingsChanged(c)];
    const getSpy = vi.spyOn(chromeMock.storage.local, 'get');

    fireSettingsChange();
    await new Promise((r) => setTimeout(r, 0));

    expect(settingsReads(getSpy)).toBe(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
    getSpy.mockRestore();
    for (const u of unsubs) u();
  });

  it('keeps delivering to the others when one subscriber unsubscribes', async () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = onSettingsChanged(a);
    const unsubB = onSettingsChanged(b);

    unsubA();
    fireSettingsChange();
    await new Promise((r) => setTimeout(r, 0));

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    unsubB();
  });

  it('a throwing subscriber does not swallow the ones after it', async () => {
    const boom = vi.fn(() => {
      throw new Error('boom');
    });
    const after = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unsubs = [onSettingsChanged(boom), onSettingsChanged(after)];

    fireSettingsChange();
    await new Promise((r) => setTimeout(r, 0));

    expect(boom).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    for (const u of unsubs) u();
  });

  it('listens on the local area only, so a session change never reaches the handler', async () => {
    const addGlobal = vi.spyOn(chromeMock.storage.onChanged, 'addListener');
    const cb = vi.fn();
    const unsub = onSettingsChanged(cb);

    chromeMock.storage.session._fire({ [STORAGE_KEYS.settings]: { newValue: {} } });
    await new Promise((r) => setTimeout(r, 0));
    expect(addGlobal).not.toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();

    fireSettingsChange();
    await new Promise((r) => setTimeout(r, 0));
    expect(cb).toHaveBeenCalledTimes(1);
    addGlobal.mockRestore();
    unsub();
  });

  it('drops the chrome listener once the last subscriber leaves', async () => {
    const cb = vi.fn();
    const unsub = onSettingsChanged(cb);
    unsub();
    const getSpy = vi.spyOn(chromeMock.storage.local, 'get');

    fireSettingsChange();
    await new Promise((r) => setTimeout(r, 0));

    expect(settingsReads(getSpy)).toBe(0);
    expect(cb).not.toHaveBeenCalled();
    getSpy.mockRestore();
  });
});
