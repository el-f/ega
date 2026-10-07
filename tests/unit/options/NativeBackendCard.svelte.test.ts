// @vitest-environment jsdom
import { resetProbeNativeHostForTest } from '@/options/probeNativeHost';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import NativeBackendCard from '@/options/components/NativeBackendCard.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';

function baseProps() {
  return {
    settings: structuredClone(DEFAULT_SETTINGS) as Settings,
    disabled: false,
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

/** Resolves once the mount-time probe has settled the status pill (and the card dot) on `state`. */
async function settled(root: HTMLElement, state: 'installed' | 'missing'): Promise<void> {
  await waitFor(() => {
    expect(root.querySelector('[data-testid="nh-status-pill"]')?.classList).toContain(
      `nh-${state}`,
    );
    expect(
      root.querySelector('[data-ega-backend-status]')?.getAttribute('data-ega-backend-status'),
    ).not.toBe('Checking...');
  });
}

describe('NativeBackendCard', () => {
  beforeEach(() => {
    resetProbeNativeHostForTest();
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
    await settled(container, 'installed');
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

    const { getByTestId, container } = render(NativeBackendCard, baseProps());
    const btn = getByTestId('backend-card-test-native') as HTMLButtonElement;
    await settled(container, 'installed');
    expect(btn.disabled).toBe(false);
    await fireEvent.click(btn);
  });

  it('shows a transient "Now reachable" banner after recheck flips missing → installed', async () => {
    const ctor = chrome.runtime.connectNative as unknown as Mock;
    ctor.mockReturnValue(failingPort());

    const { getByLabelText, queryByTestId, container } = render(NativeBackendCard, baseProps());
    await settled(container, 'missing');
    expect(queryByTestId('nh-recovered-banner')).toBeNull();

    ctor.mockReturnValue(healthyPort());
    await fireEvent.click(getByLabelText('Recheck'));
    await waitFor(() => expect(queryByTestId('nh-recovered-banner')).toBeTruthy());
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

    const { getByTestId, container } = render(NativeBackendCard, baseProps());
    await settled(container, 'installed');
    const panel = getByTestId('nh-install-panel') as HTMLDetailsElement;
    expect(panel.open).toBe(false);
  });

  it('keeps the install panel open across a remount, as on a tab switch', async () => {
    const ctor = chrome.runtime.connectNative as unknown as Mock;
    ctor.mockReturnValue(healthyPort());
    const setOpen = async (panel: HTMLDetailsElement, open: boolean) => {
      panel.open = open;
      panel.dispatchEvent(new Event('toggle'));
      await tick();
    };

    const first = render(NativeBackendCard, baseProps());
    await settled(first.container, 'installed');
    await setOpen(first.getByTestId('nh-install-panel') as HTMLDetailsElement, true);
    first.unmount();

    const second = render(NativeBackendCard, baseProps());
    await settled(second.container, 'installed');
    const panel = second.getByTestId('nh-install-panel') as HTMLDetailsElement;
    try {
      expect(panel.open).toBe(true);
    } finally {
      await setOpen(panel, false);
    }
  });

  it('not installed: one status in words, no second pill, no CLI start state', async () => {
    const ctor = chrome.runtime.connectNative as unknown as Mock;
    ctor.mockReturnValue(failingPort());
    const { container } = render(NativeBackendCard, baseProps());
    await settled(container, 'missing');
    const body = container.querySelector('.nh-body');
    const words = (el: Element | null | undefined) => el?.textContent.replace(/\s+/g, ' ').trim();
    expect(words(body?.querySelector('[data-testid="nh-status-pill"]'))).toBe(
      'Not installed on this computer',
    );
    // The row header holds the one status pill; the body adds none.
    expect(body?.querySelectorAll('.ega-badge, [class*="pill"]')).toHaveLength(0);
    expect(body?.textContent).not.toMatch(/starts the CLI|Cold/);
    expect(body?.querySelector('summary')?.textContent.trim()).toBe('Show install steps');
  });

  it('installed: the version in words, then how the next answer starts', async () => {
    const ctor = chrome.runtime.connectNative as unknown as Mock;
    ctor.mockReturnValue(healthyPort(4));
    const { container } = render(NativeBackendCard, baseProps());
    await settled(container, 'installed');
    expect(container.querySelector('[data-testid="nh-status-pill"]')?.textContent.trim()).toBe(
      'Installed, version 4',
    );
    expect(container.querySelector('.nh-line')?.textContent).toBe(
      'The first translation starts the CLI',
    );
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

    const { getByLabelText, getByTestId, container } = render(NativeBackendCard, baseProps());
    await settled(container, 'missing');
    const panel = getByTestId('nh-install-panel') as HTMLDetailsElement;
    panel.open = true;
    panel.dispatchEvent(new Event('toggle'));
    await tick();
    expect(panel.querySelector('[data-testid="nh-install-codeblock"]')).not.toBeNull();
    expect(panel.querySelector('[aria-label="Recheck"]')).toBeNull();

    ctor.mockClear();
    ctor.mockReturnValue(failingPort());
    await fireEvent.click(getByLabelText('Recheck'));
    await waitFor(() => expect(ctor).toHaveBeenCalled());
  });
});

describe('NativeBackendCard — pre-warm toggle', () => {
  beforeEach(() => {
    resetProbeNativeHostForTest();
  });

  it('lives in the native card and writes preWarmNative', async () => {
    const props = baseProps();
    const { container } = render(NativeBackendCard, props);
    const box = container.querySelector<HTMLInputElement>(
      '[data-backend-id="native"] [data-ega-setting="backends.preWarmNative"]',
    );
    if (!box) throw new Error('pre-warm toggle not in the native card');
    expect(box.checked).toBe(true);
    await fireEvent.click(box);
    expect(props.onPatch).toHaveBeenCalledWith({ preWarmNative: false });
  });

  it('names the toggle in plain words and describes it with the search hint', () => {
    render(NativeBackendCard, baseProps());
    const box = screen.getByRole('checkbox', { name: 'Start the native host with Chrome' });
    const hint = document.getElementById('ega-prewarm-hint');
    expect(box.getAttribute('aria-describedby')?.split(' ')).toContain('ega-prewarm-hint');
    expect(hint?.textContent).toBe('Faster first answer, uses some battery');
  });
});
