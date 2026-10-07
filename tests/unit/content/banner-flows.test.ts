import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';

const mocks = vi.hoisted(() => ({
  showToast: vi.fn(),
  updateSettings: vi.fn(() => Promise.resolve()),
  ctxValid: { value: true },
}));
vi.mock('@/content/toast', () => ({ showToast: mocks.showToast }));
vi.mock('@/shared/storage', () => ({ updateSettings: mocks.updateSettings }));
vi.mock('@/content/context-guard', () => ({
  isExtensionContextValid: () => mocks.ctxValid.value,
}));

function smartSettings(): Settings {
  return { ...DEFAULT_SETTINGS, bubbleMode: 'smart', smartBubbleBannerShown: false };
}

async function load(): Promise<{
  maybeShowSmartBannerOnce: (s: Settings, reason: 'english' | 'too-short' | 'empty') => void;
  cancelSmartBannerPoll: () => void;
  pending: Map<string, unknown>;
}> {
  vi.resetModules();
  mocks.showToast.mockClear();
  const [flows, reqState] = await Promise.all([
    import('@/content/banner-flows'),
    import('@/content/request-state'),
  ]);
  return {
    maybeShowSmartBannerOnce: flows.maybeShowSmartBannerOnce,
    cancelSmartBannerPoll: flows.cancelSmartBannerPoll,
    pending: reqState.pending as Map<string, unknown>,
  };
}

describe('maybeShowSmartBannerOnce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.ctxValid.value = true;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows at once when no translate is in flight', async () => {
    const { maybeShowSmartBannerOnce } = await load();
    maybeShowSmartBannerOnce(smartSettings(), 'english');
    expect(mocks.showToast).toHaveBeenCalledTimes(1);
  });

  it('states the behavior in plain words, as a toast that stays until dismissed', async () => {
    const { maybeShowSmartBannerOnce } = await load();
    maybeShowSmartBannerOnce(smartSettings(), 'english');
    const [message, opts] = mocks.showToast.mock.calls[0] as [string, { kind: string }];
    expect(message).toBe(
      "The bubble only shows on text that isn't English. Change this in Settings.",
    );
    expect(opts.kind).toBe('info');
  });

  it('stores the once-per-install flag when it shows', async () => {
    const { maybeShowSmartBannerOnce } = await load();
    const send = vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
    maybeShowSmartBannerOnce(smartSettings(), 'english');
    expect(send).toHaveBeenCalledWith({
      kind: 'settings:update',
      patch: { smartBubbleBannerShown: true },
    });
  });

  it('offers Open settings, which goes to the Selection & picker tab', async () => {
    const { maybeShowSmartBannerOnce } = await load();
    const send = vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
    maybeShowSmartBannerOnce(smartSettings(), 'english');
    const arg = mocks.showToast.mock.calls[0]?.[1] as {
      action?: { label: string; run: () => void };
    };
    expect(arg.action?.label).toBe('Open settings');
    arg.action?.run();
    expect(send).toHaveBeenCalledWith({ kind: 'ui:open-options', tab: 'selection-bubble' });
  });

  it('waits for an in-flight translate to settle before showing', async () => {
    const { maybeShowSmartBannerOnce, pending } = await load();
    pending.set('r1', {});
    maybeShowSmartBannerOnce(smartSettings(), 'english');
    expect(mocks.showToast).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2_000);
    expect(mocks.showToast).not.toHaveBeenCalled();

    pending.delete('r1');
    vi.advanceTimersByTime(600);
    expect(mocks.showToast).toHaveBeenCalledTimes(1);
  });

  it('stops deferring after a minute even if something is still pending', async () => {
    const { maybeShowSmartBannerOnce, pending } = await load();
    pending.set('r1', {});
    maybeShowSmartBannerOnce(smartSettings(), 'english');
    vi.advanceTimersByTime(61_000);
    expect(mocks.showToast).toHaveBeenCalledTimes(1);
    pending.delete('r1');
  });

  it('stays quiet, and keeps the flag, for a hold-back that is not English text', async () => {
    const { maybeShowSmartBannerOnce } = await load();
    const send = vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
    maybeShowSmartBannerOnce(smartSettings(), 'too-short');
    maybeShowSmartBannerOnce(smartSettings(), 'empty');
    expect(mocks.showToast).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    maybeShowSmartBannerOnce(smartSettings(), 'english');
    expect(mocks.showToast).toHaveBeenCalledTimes(1);
  });

  it('shows once per session', async () => {
    const { maybeShowSmartBannerOnce } = await load();
    maybeShowSmartBannerOnce(smartSettings(), 'english');
    maybeShowSmartBannerOnce(smartSettings(), 'english');
    expect(mocks.showToast).toHaveBeenCalledTimes(1);
  });

  it('never shows when the flag is already persisted or the mode is not smart', async () => {
    const { maybeShowSmartBannerOnce } = await load();
    maybeShowSmartBannerOnce({ ...smartSettings(), smartBubbleBannerShown: true }, 'english');
    maybeShowSmartBannerOnce({ ...smartSettings(), bubbleMode: 'always' }, 'english');
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('cancelSmartBannerPoll stops a deferring poll for good', async () => {
    const { maybeShowSmartBannerOnce, cancelSmartBannerPoll, pending } = await load();
    pending.set('r1', {});
    maybeShowSmartBannerOnce(smartSettings(), 'english');
    vi.advanceTimersByTime(1_000);
    cancelSmartBannerPoll();
    pending.delete('r1');
    vi.advanceTimersByTime(120_000);
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('never shows once the extension context is invalidated mid-defer', async () => {
    const { maybeShowSmartBannerOnce, pending } = await load();
    pending.set('r1', {});
    maybeShowSmartBannerOnce(smartSettings(), 'english');
    mocks.ctxValid.value = false;
    pending.delete('r1');
    vi.advanceTimersByTime(120_000);
    expect(mocks.showToast).not.toHaveBeenCalled();
  });
});
