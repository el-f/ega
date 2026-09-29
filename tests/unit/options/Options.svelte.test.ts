// @vitest-environment jsdom
import { _resetProbeNativeHostForTest } from '@/options/probeNativeHost';
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import { EXPECTED_HOST_VERSION } from '@/options/nativeHostInstall';
import Options from '@/options/Options.svelte';

/** Makes probeNativeHost resolve 'installed' (ping ack with matching id and host version); the default mock disconnects. */
function mockNativeHostInstalled(): void {
  chromeMock.runtime.connectNative.mockImplementation(() => {
    const listeners: Array<(m: unknown) => void> = [];
    const port = {
      name: 'ega-native-installed-stub',
      onDisconnect: { addListener: () => {}, removeListener: () => {} },
      onMessage: { addListener: (fn: (m: unknown) => void) => listeners.push(fn) },
      postMessage: (frame: { id?: string }) => {
        queueMicrotask(() => {
          for (const fn of listeners)
            fn({ id: frame.id, type: 'pong', hostVersion: EXPECTED_HOST_VERSION });
        });
      },
      disconnect: () => {},
    } as unknown as chrome.runtime.Port;
    return port;
  });
}

const SETTINGS_KEY = 'ega.settings';

function seedSettings(overrides: Record<string, unknown> = {}): void {
  const defaults = parseSettings(overrides);
  chromeMock.storage.local._raw.set(SETTINGS_KEY, defaults);
}

function tabLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[role="tab"]')).map((el) =>
    (el.textContent as string).trim(),
  );
}

describe('Options.svelte — V2 IA nav', () => {
  beforeEach(() => {
    _resetProbeNativeHostForTest();
    resetChromeMock();
  });

  it('renders V2 feature-scoped tabs', async () => {
    seedSettings();
    const { container } = render(Options);
    await waitFor(() => {
      const labels = tabLabels(container);
      expect(labels).toContain('Translate');
    });
    const labels = tabLabels(container);
    expect(labels).toContain('Selection & picker');
    expect(labels).toContain('Templates');
    expect(labels).toContain('Backends');
    expect(labels).toContain('Languages');
    expect(labels).toContain('Advanced');
    expect(labels).toContain('About');
    expect(labels).not.toContain('Display');
    expect(labels).not.toContain('Defaults');
  });

  it('moves focus to .options-content after a tab switch', async () => {
    seedSettings();
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[role="tab"]')).toBeTruthy();
    });
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    // Pick a tab that's not the default "Translate" landing.
    const advTab = Array.from(tabs).find((t) => (t.textContent || '').trim() === 'Advanced');
    expect(advTab).toBeTruthy();
    await fireEvent.click(advTab as HTMLButtonElement);
    // queueMicrotask flush in the $effect.
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const panel = container.querySelector<HTMLElement>('.options-content');
    expect(panel).toBeTruthy();
    expect(document.activeElement).toBe(panel);
  });

  it('keeps focus on the rail tab after arrow-key activation, so arrows keep walking', async () => {
    seedSettings();
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('#tab-translate')).toBeTruthy();
    });
    const first = container.querySelector<HTMLButtonElement>('#tab-translate');
    first?.focus();
    await fireEvent.keyDown(first as HTMLButtonElement, { key: 'ArrowDown' });
    // Let both microtasks run: the rail re-focus and the panel-focus effect.
    await new Promise<void>((r) => setTimeout(r, 0));
    const next = container.querySelector<HTMLButtonElement>('#tab-selection-bubble');
    expect(next?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(next);
  });
});

describe('Options.svelte — needs-key banner vs native host', () => {
  beforeEach(() => {
    _resetProbeNativeHostForTest();
    resetChromeMock();
  });

  it('shows the needs-key banner when no cloud key, no ollama, and native host is not installed', async () => {
    // No native host, so the banner shows; dismiss onboarding, which outranks it.
    seedSettings({ onboardingDismissed: true });
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-status-bar="needs-key"]')).toBeTruthy();
    });
  });

  it('suppresses the needs-key banner once a cloud API key is configured', async () => {
    seedSettings({ anthropicApiKey: 'sk-ant-test' });
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[role="tab"]')).toBeTruthy();
    });
    expect(container.querySelector('[data-ega-status-bar="needs-key"]')).toBeFalsy();
  });

  it('suppresses the needs-key banner when the native host is installed (cold but reachable)', async () => {
    // An installed native host translates with zero config, so no banner, even when the host is cold.
    mockNativeHostInstalled();
    seedSettings();
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[role="tab"]')).toBeTruthy();
    });
    await waitFor(() => {
      expect(container.querySelector('[data-ega-status-bar="needs-key"]')).toBeFalsy();
    });
  });
});

describe('Options.svelte — onboarding banner suppression', () => {
  beforeEach(() => {
    _resetProbeNativeHostForTest();
    resetChromeMock();
  });

  it('with no backend at all, onboarding wins over needs-key (priority)', async () => {
    // Fresh install: both banners qualify and onboarding wins.
    seedSettings({ onboardingDismissed: false });
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-status-bar="onboarding"]')).toBeTruthy();
    });
    expect(container.querySelector('[data-ega-status-bar="needs-key"]')).toBeFalsy();
  });

  it('suppresses onboarding when the native host is installed (READY without a key)', async () => {
    // A ready native host needs no key, so onboarding stays hidden.
    mockNativeHostInstalled();
    seedSettings({ onboardingDismissed: false });
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[role="tab"]')).toBeTruthy();
    });
    await waitFor(() => {
      expect(container.querySelector('[data-ega-status-bar="onboarding"]')).toBeFalsy();
    });
  });

  it('keeps onboarding hidden after a later storage change once the user picks a backend', async () => {
    // A reachable-but-disabled native host is the only state that renders onboarding.
    mockNativeHostInstalled();
    seedSettings({ onboardingDismissed: false, disabledBackends: ['native'] });
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-status-bar="onboarding"]')).toBeTruthy();
    });

    const gemini = container.querySelector<HTMLButtonElement>('[data-ega-onboard="gemini"]');
    expect(gemini).toBeTruthy();
    await fireEvent.click(gemini as HTMLButtonElement);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-status-bar="onboarding"]')).toBeFalsy();
    });

    chromeMock.storage.local._fire({ 'ega.settings': { newValue: {} } });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-ega-status-bar="onboarding"]')).toBeFalsy();
  });

  it('the Gemini CTA lands on the Backends tab with the Gemini card open and its key input focused', async () => {
    mockNativeHostInstalled();
    seedSettings({ onboardingDismissed: false, disabledBackends: ['native'] });
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-onboard="gemini"]')).toBeTruthy();
    });

    const gemini = container.querySelector<HTMLButtonElement>('[data-ega-onboard="gemini"]');
    await fireEvent.click(gemini as HTMLButtonElement);

    await waitFor(() => {
      const card = container.querySelector<HTMLDetailsElement>('details[data-backend-id="gemini"]');
      expect(card).toBeTruthy();
      expect(card?.open).toBe(true);
      const keyInput = card?.querySelector<HTMLInputElement>('.cp-key-input');
      expect(keyInput).toBeTruthy();
      expect(document.activeElement).toBe(keyInput);
    });
  });

  it('suppresses onboarding when an ollama URL is set on an enabled ollama', async () => {
    // ollama ships disabled, so the URL alone is not a usable backend.
    seedSettings({
      onboardingDismissed: false,
      ollamaUrl: 'http://localhost:11434',
      disabledBackends: [],
    });
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[role="tab"]')).toBeTruthy();
    });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-ega-status-bar="onboarding"]')).toBeFalsy();
  });
});
