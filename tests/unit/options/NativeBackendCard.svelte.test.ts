// @vitest-environment jsdom
import { _resetProbeNativeHostForTest } from '@/options/probeNativeHost';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import NativeBackendCard from '@/options/components/NativeBackendCard.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';

function baseProps() {
  return {
    settings: structuredClone(DEFAULT_SETTINGS) as Settings,
    disabled: false,
    routeIsText: false,
    routeIsImage: false,
    onPatch: vi.fn(),
    onPatchModel: vi.fn(),
  };
}

interface PortMock {
  postMessage: Mock;
  disconnect: Mock;
  onMessage: { addListener: (fn: (m: unknown) => void) => void; removeListener: () => void };
  onDisconnect: { addListener: (fn: () => void) => void; removeListener: () => void };
}

function healthyPort(replyHostVersion = 99): PortMock {
  // Echo whatever id the probe posts; it filters replies by that id.
  let postedId: string | undefined;
  let replyFn: ((m: unknown) => void) | undefined;
  return {
    postMessage: vi.fn((m: unknown) => {
      const f = m as { id?: string };
      postedId = f.id;
      if (replyFn) {
        const fn = replyFn;
        setTimeout(
          () => fn({ v: 1, id: postedId, type: 'done', hostVersion: replyHostVersion }),
          1,
        );
      }
    }),
    disconnect: vi.fn(),
    onMessage: {
      addListener: (fn) => {
        replyFn = fn;
      },
      removeListener: () => {},
    },
    onDisconnect: { addListener: () => {}, removeListener: () => {} },
  };
}

function failingPort(): PortMock {
  return {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: { addListener: () => {}, removeListener: () => {} },
    onDisconnect: {
      addListener: (fn) => setTimeout(fn, 1),
      removeListener: () => {},
    },
  };
}

describe('NativeBackendCard', () => {
  beforeEach(() => {
    _resetProbeNativeHostForTest();
    delete (chrome.runtime as { lastError?: chrome.runtime.LastError }).lastError;
  });

  it('renders a Native host card with the shared BackendCard chrome', () => {
    const { container } = render(NativeBackendCard, baseProps());
    expect(container.querySelector('[data-backend-id="native"]')).toBeTruthy();
  });

  it('exposes the BackendCard Test button (data-testid backend-card-test-native)', () => {
    const { getByTestId } = render(NativeBackendCard, baseProps());
    expect(getByTestId('backend-card-test-native')).toBeTruthy();
  });

  it('CollapsibleCard summary toggles the body open/closed on click', async () => {
    const ctor = chrome.runtime.connectNative as unknown as Mock;
    ctor.mockReturnValue(healthyPort());

    const { container } = render(NativeBackendCard, baseProps());
    await new Promise((r) => setTimeout(r, 30));
    const details = container.querySelector(
      'details[data-backend-id="native"]',
    ) as HTMLDetailsElement;
    expect(details).toBeTruthy();
    // Default: ready backend stays closed; user click flips to open.
    expect(details.open).toBe(false);
    const summary = details.querySelector('summary') as HTMLElement;
    await fireEvent.click(summary);
    expect(details.open).toBe(true);
  });

  it('Test button is enabled when host is reachable + click does not throw', async () => {
    const ctor = chrome.runtime.connectNative as unknown as Mock;
    ctor.mockReturnValue(healthyPort());

    const { getByTestId } = render(NativeBackendCard, baseProps());
    const btn = getByTestId('backend-card-test-native') as HTMLButtonElement;
    // Wait for the BackendCard $effect probe + native onMount probe to settle.
    await new Promise((r) => setTimeout(r, 30));
    expect(btn.disabled).toBe(false);
    await fireEvent.click(btn);
  });

  it('shows a transient "Now reachable" banner after recheck flips missing → installed', async () => {
    const ctor = chrome.runtime.connectNative as unknown as Mock;
    ctor.mockReturnValue(failingPort());

    const { getByLabelText, queryByTestId, getByTestId } = render(NativeBackendCard, baseProps());
    await new Promise((r) => setTimeout(r, 30));
    expect(queryByTestId('nh-recovered-banner')).toBeNull();

    ctor.mockReturnValue(healthyPort());
    await fireEvent.click(getByLabelText('Recheck'));
    await new Promise((r) => setTimeout(r, 30));
    expect(getByTestId('nh-recovered-banner')).toBeTruthy();
  });

  it('closes every port it opens, so no host process outlives a request', async () => {
    const ports: PortMock[] = [];
    const ctor = chrome.runtime.connectNative as unknown as Mock;
    const defaultConnect = ctor.getMockImplementation();
    ctor.mockImplementation(() => {
      const p = healthyPort();
      ports.push(p);
      return p;
    });
    try {
      render(NativeBackendCard, baseProps());
      await vi.waitFor(() => {
        const kinds = ports.flatMap((p) =>
          p.postMessage.mock.calls.map((c) => (c[0] as { kind?: string }).kind),
        );
        expect(kinds).toEqual(expect.arrayContaining(['ping', 'list-models', 'probe-cli']));
        for (const p of ports) expect(p.disconnect).toHaveBeenCalled();
      });
    } finally {
      if (defaultConnect) ctor.mockImplementation(defaultConnect);
    }
  });

  it('install panel starts collapsed when host is healthy on mount', async () => {
    const ctor = chrome.runtime.connectNative as unknown as Mock;
    ctor.mockReturnValue(healthyPort());

    const { getByTestId } = render(NativeBackendCard, baseProps());
    await new Promise((r) => setTimeout(r, 30));
    const panel = getByTestId('nh-install-panel') as HTMLDetailsElement;
    expect(panel.open).toBe(false);
  });

  it('keeps the install panel open across a remount, as on a tab switch', async () => {
    const ctor = chrome.runtime.connectNative as unknown as Mock;
    ctor.mockReturnValue(healthyPort());
    const setOpen = async (panel: HTMLDetailsElement, open: boolean) => {
      panel.open = open;
      panel.dispatchEvent(new Event('toggle'));
      await new Promise((r) => setTimeout(r, 10));
    };

    const first = render(NativeBackendCard, baseProps());
    await new Promise((r) => setTimeout(r, 30));
    await setOpen(first.getByTestId('nh-install-panel') as HTMLDetailsElement, true);
    first.unmount();

    const second = render(NativeBackendCard, baseProps());
    await new Promise((r) => setTimeout(r, 30));
    const panel = second.getByTestId('nh-install-panel') as HTMLDetailsElement;
    try {
      expect(panel.open).toBe(true);
    } finally {
      await setOpen(panel, false);
    }
  });

  it('does NOT render a persistent-session toggle', () => {
    const ctor = chrome.runtime.connectNative as unknown as Mock;
    ctor.mockReturnValue(healthyPort());
    const { queryByTestId } = render(NativeBackendCard, baseProps());
    expect(queryByTestId('nh-persistent-session-toggle')).toBeNull();
  });

  it('top Recheck button re-runs the probe (no in-panel duplicate)', async () => {
    const ctor = chrome.runtime.connectNative as unknown as Mock;
    ctor.mockReturnValue(failingPort());

    const { getByLabelText, getByTestId } = render(NativeBackendCard, baseProps());
    await new Promise((r) => setTimeout(r, 30));
    const panel = getByTestId('nh-install-panel') as HTMLDetailsElement;
    panel.open = true;
    panel.dispatchEvent(new Event('toggle'));
    await new Promise((r) => setTimeout(r, 10));
    expect(panel.querySelector('[aria-label="Recheck"]')).toBeNull();

    ctor.mockClear();
    ctor.mockReturnValue(failingPort());
    await fireEvent.click(getByLabelText('Recheck'));
    await new Promise((r) => setTimeout(r, 10));
    expect(ctor).toHaveBeenCalled();
  });
});
