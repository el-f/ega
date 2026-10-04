import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { SETTINGS_TABS } from '@/shared/settings-tabs';
import type { Settings } from '@/shared/types';

const mocks = vi.hoisted(() => ({
  showBanner: vi.fn(),
  updateSettings: vi.fn(() => Promise.resolve()),
  ctxValid: { value: true },
}));
vi.mock('@/content/banner', () => ({ showBanner: mocks.showBanner }));
vi.mock('@/shared/storage', () => ({ updateSettings: mocks.updateSettings }));
vi.mock('@/content/context-guard', () => ({
  isExtensionContextValid: () => mocks.ctxValid.value,
}));

function smartSettings(): Settings {
  return { ...DEFAULT_SETTINGS, bubbleMode: 'smart', smartBubbleBannerShown: false };
}

async function load(): Promise<{
  maybeShowSmartBannerOnce: (s: Settings) => void;
  cancelSmartBannerPoll: () => void;
  pending: Map<string, unknown>;
}> {
  vi.resetModules();
  mocks.showBanner.mockClear();
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
    maybeShowSmartBannerOnce(smartSettings());
    expect(mocks.showBanner).toHaveBeenCalledTimes(1);
  });

  it('states the behavior in plain words, and points at a tab that exists', async () => {
    const { maybeShowSmartBannerOnce } = await load();
    maybeShowSmartBannerOnce(smartSettings());
    const arg = mocks.showBanner.mock.calls[0]?.[0] as { message: string };
    expect(arg.message).toContain('translate button');
    const tab = SETTINGS_TABS.find((t) => arg.message.includes(`Settings → ${t.label}`));
    expect(tab?.id).toBe('selection-bubble');
    // A first-time user never saw the old behavior, so "now" describes a change they missed.
    expect(arg.message).not.toMatch(/\bnow\b/);
    expect(arg.message).not.toMatch(/detects something worth/);
  });

  it('waits for an in-flight translate to settle before showing', async () => {
    const { maybeShowSmartBannerOnce, pending } = await load();
    pending.set('r1', {});
    maybeShowSmartBannerOnce(smartSettings());
    expect(mocks.showBanner).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2_000);
    expect(mocks.showBanner).not.toHaveBeenCalled();

    pending.delete('r1');
    vi.advanceTimersByTime(600);
    expect(mocks.showBanner).toHaveBeenCalledTimes(1);
  });

  it('stops deferring after a minute even if something is still pending', async () => {
    const { maybeShowSmartBannerOnce, pending } = await load();
    pending.set('r1', {});
    maybeShowSmartBannerOnce(smartSettings());
    vi.advanceTimersByTime(61_000);
    expect(mocks.showBanner).toHaveBeenCalledTimes(1);
    pending.delete('r1');
  });

  it('shows once per session', async () => {
    const { maybeShowSmartBannerOnce } = await load();
    maybeShowSmartBannerOnce(smartSettings());
    maybeShowSmartBannerOnce(smartSettings());
    expect(mocks.showBanner).toHaveBeenCalledTimes(1);
  });

  it('never shows when the flag is already persisted or the mode is not smart', async () => {
    const { maybeShowSmartBannerOnce } = await load();
    maybeShowSmartBannerOnce({ ...smartSettings(), smartBubbleBannerShown: true });
    maybeShowSmartBannerOnce({ ...smartSettings(), bubbleMode: 'always' });
    expect(mocks.showBanner).not.toHaveBeenCalled();
  });

  it('cancelSmartBannerPoll stops a deferring poll for good', async () => {
    const { maybeShowSmartBannerOnce, cancelSmartBannerPoll, pending } = await load();
    pending.set('r1', {});
    maybeShowSmartBannerOnce(smartSettings());
    vi.advanceTimersByTime(1_000);
    cancelSmartBannerPoll();
    pending.delete('r1');
    vi.advanceTimersByTime(120_000);
    expect(mocks.showBanner).not.toHaveBeenCalled();
  });

  it('never shows once the extension context is invalidated mid-defer', async () => {
    const { maybeShowSmartBannerOnce, pending } = await load();
    pending.set('r1', {});
    maybeShowSmartBannerOnce(smartSettings());
    mocks.ctxValid.value = false;
    pending.delete('r1');
    vi.advanceTimersByTime(120_000);
    expect(mocks.showBanner).not.toHaveBeenCalled();
  });
});
