// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import NativeBackendCard from '@/options/components/NativeBackendCard.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';
import { flushAsync } from '@tests/_helpers/async';

function healthyPort() {
  let replyFn: ((m: unknown) => void) | undefined;
  return {
    postMessage: vi.fn((m: unknown) => {
      const id = (m as { id?: string }).id;
      const fn = replyFn;
      if (fn) setTimeout(() => fn({ v: 1, id, type: 'done', hostVersion: 99 }), 1);
    }),
    disconnect: vi.fn(),
    onMessage: {
      addListener: (fn: (m: unknown) => void) => {
        replyFn = fn;
      },
      removeListener: () => {},
    },
    onDisconnect: { addListener: () => {}, removeListener: () => {} },
  };
}

function props(over: Partial<Settings> = {}) {
  return {
    settings: { ...structuredClone(DEFAULT_SETTINGS), ...over } as Settings,
    disabled: false,
    onPatch: vi.fn(),
    onPatchModel: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('NativeBackendCard CLI switch', () => {
  it('shows a model example for the selected CLI and clears the model when the CLI changes', async () => {
    vi.stubGlobal('chrome', {
      ...globalThis.chrome,
      runtime: {
        ...globalThis.chrome.runtime,
        connectNative: vi.fn(() => healthyPort() as unknown as chrome.runtime.Port),
      },
    });
    const p = props({ model: { ...DEFAULT_SETTINGS.model, native: 'sonnet' } });
    const { container, getByRole } = render(NativeBackendCard, { props: p });

    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>('[data-ega-model-combobox] input');
      if (!el) throw new Error('model field not rendered yet');
      return el;
    });
    expect(input.placeholder).toBe('e.g. sonnet');

    await fireEvent.click(getByRole('radio', { name: /Codex/ }));
    expect(p.onPatch).toHaveBeenCalledWith({
      nativeCli: 'codex',
      model: { ...DEFAULT_SETTINGS.model, native: '' },
    });
  });
});

function probingPort(
  loggedIn: Record<string, boolean | null>,
  onCliAnswered = (): void => {},
  cli: Record<string, string | null> = { claude: 'C:/bin/claude.exe', codex: 'C:/bin/codex.cmd' },
) {
  let replyFn: ((m: unknown) => void) | undefined;
  return {
    postMessage: vi.fn((m: unknown) => {
      const { id, kind } = m as { id?: string; kind?: string };
      const fn = replyFn;
      if (!fn) return;
      setTimeout(() => {
        if (kind === 'probe-cli') {
          fn({
            v: 1,
            id,
            type: 'cli-presence',
            cli,
          });
          fn({ v: 1, id, type: 'cli-login', loggedIn });
        }
        fn({ v: 1, id, type: 'done', hostVersion: 99 });
        if (kind === 'probe-cli') onCliAnswered();
      }, 1);
    }),
    disconnect: vi.fn(),
    onMessage: {
      addListener: (fn: (m: unknown) => void) => {
        replyFn = fn;
      },
      removeListener: () => {},
    },
    onDisconnect: { addListener: () => {}, removeListener: () => {} },
  };
}

describe('NativeBackendCard login state', () => {
  it('says the selected CLI is not logged in and names the command that logs in', async () => {
    vi.stubGlobal('chrome', {
      ...globalThis.chrome,
      runtime: {
        ...globalThis.chrome.runtime,
        connectNative: vi.fn(
          () => probingPort({ claude: false, codex: true }) as unknown as chrome.runtime.Port,
        ),
      },
    });
    const { findByTestId, getByText } = render(NativeBackendCard, { props: props() });

    const banner = await findByTestId('nh-cli-logged-out-banner');
    expect(banner.textContent).toContain('Claude Code is not logged in');
    expect(banner.textContent).toContain('claude');
    expect(getByText('Not logged in')).toBeTruthy();
  });

  it('says a missing CLI was not found on this computer and keeps PATH in the steps', async () => {
    vi.stubGlobal('chrome', {
      ...globalThis.chrome,
      runtime: {
        ...globalThis.chrome.runtime,
        connectNative: vi.fn(
          () =>
            probingPort({ claude: null, codex: null }, () => {}, {
              claude: null,
              codex: 'C:/bin/codex.cmd',
            }) as unknown as chrome.runtime.Port,
        ),
      },
    });
    const { findByTestId, getByRole } = render(NativeBackendCard, { props: props() });

    const banner = await findByTestId('nh-cli-missing-banner');
    expect(banner.querySelector('.nh-msg-title')?.textContent).toBe(
      'Claude Code was not found on this computer',
    );
    const steps = banner.querySelector('details');
    expect(steps?.open).toBe(false);
    expect(steps?.querySelector('summary')?.textContent).toContain('Show steps');
    expect(steps?.textContent).toContain('PATH');
    expect(getByRole('radio', { name: /^Claude Code\s+Not found$/ })).toBeTruthy();
  });

  it('shows no login banner when the host cannot tell', async () => {
    let cliAnswered = false;
    vi.stubGlobal('chrome', {
      ...globalThis.chrome,
      runtime: {
        ...globalThis.chrome.runtime,
        connectNative: vi.fn(
          () =>
            probingPort({ claude: null, codex: null }, () => {
              cliAnswered = true;
            }) as unknown as chrome.runtime.Port,
        ),
      },
    });
    const { container, queryByTestId } = render(NativeBackendCard, { props: props() });
    await waitFor(() => {
      if (!container.querySelector('[data-ega-model-combobox]'))
        throw new Error('not installed yet');
    });
    await waitFor(() => expect(cliAnswered).toBe(true));
    await flushAsync();
    expect(queryByTestId('nh-cli-logged-out-banner')).toBeNull();
  });
});
