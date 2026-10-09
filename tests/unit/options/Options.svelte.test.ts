// @vitest-environment jsdom
import { resetProbeNativeHostForTest } from '@/options/probeNativeHost';
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

async function openBackends(container: HTMLElement): Promise<void> {
  await waitFor(() => {
    expect(container.querySelector('#tab-backends')).toBeTruthy();
  });
  await fireEvent.click(container.querySelector('#tab-backends') as HTMLElement);
}

function tabLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[role="tab"]')).map((el) =>
    (el.textContent as string).trim(),
  );
}

describe('Options.svelte — V2 IA nav', () => {
  beforeEach(() => {
    resetProbeNativeHostForTest();
    resetChromeMock();
  });

  it('renders V2 feature-scoped tabs', async () => {
    seedSettings();
    const { container } = render(Options);
    await waitFor(() => {
      const labels = tabLabels(container);
      expect(labels).toContain('Answers');
    });
    const labels = tabLabels(container);
    expect(labels).toContain('Selection and picker');
    expect(labels).toContain('Tasks');
    expect(labels).not.toContain('Templates');
    expect(labels).toContain('Backends');
    expect(labels).toContain('Languages');
    expect(labels).toContain('Advanced');
    expect(labels).toContain('About');
    expect(labels).not.toContain('Display');
    expect(labels).not.toContain('Defaults');
  });

  it('leaves focus alone when the page opens, so no ring frames the whole panel', async () => {
    seedSettings();
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('.options-content')).toBeTruthy();
    });
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(document.activeElement).not.toBe(container.querySelector('.options-content'));
  });

  it('leaves focus alone when Settings opens on a tab another surface parked (TB-4)', async () => {
    seedSettings();
    chromeMock.storage.local._raw.set('ega.pendingOptionsTab', 'backends');
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('#tab-backends')?.getAttribute('aria-selected')).toBe('true');
    });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(document.activeElement).not.toBe(container.querySelector('.options-content'));
  });

  it('keeps the panel out of the Tab order, so Tab from the rail goes to the first control (D3-13)', async () => {
    seedSettings();
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('.options-content')).toBeTruthy();
    });
    expect(container.querySelector('.options-content')?.getAttribute('tabindex')).toBe('-1');
  });

  it('ignores the page shortcuts while a dialog is open, so Alt+digit cannot unmount it (KSR-1)', async () => {
    seedSettings();
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('#tab-translate')).toBeTruthy();
    });
    await fireEvent.keyDown(document.body, { key: '?' });
    const sheet = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[aria-modal="true"]');
      if (el === null) throw new Error('the shortcut sheet did not open');
      return el;
    });
    const control = sheet.querySelector<HTMLElement>('button');
    control?.focus();
    await fireEvent.keyDown(control ?? document.body, { key: '3', code: 'Digit3', altKey: true });
    await fireEvent.keyDown(control ?? document.body, { key: 'k', ctrlKey: true });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(container.querySelector('#tab-translate')?.getAttribute('aria-selected')).toBe('true');
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
  });

  it('keeps Ctrl+Shift+R from reaching the browser while a dialog is open: a hard reload would drop typed text', async () => {
    seedSettings();
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('#tab-translate')).toBeTruthy();
    });
    await fireEvent.keyDown(document.body, { key: '?' });
    const sheet = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[aria-modal="true"]');
      if (el === null) throw new Error('the shortcut sheet did not open');
      return el;
    });
    const control = sheet.querySelector<HTMLElement>('button') ?? document.body;
    control.focus();
    const passedOn = await fireEvent.keyDown(control, { key: 'R', ctrlKey: true, shiftKey: true });
    expect(passedOn, 'the reload chord is held back').toBe(false);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(container.querySelector('#tab-translate')?.getAttribute('aria-selected')).toBe('true');
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
    const next = container.querySelector<HTMLButtonElement>('#tab-tasks');
    expect(next?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(next);
  });
});

describe('Options.svelte — needs-key banner vs native host', () => {
  beforeEach(() => {
    resetProbeNativeHostForTest();
    resetChromeMock();
  });

  it('shows the needs-key banner when no cloud key, no ollama, and native host is not installed', async () => {
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

describe('Options.svelte — the Get started card', () => {
  beforeEach(() => {
    resetProbeNativeHostForTest();
    resetChromeMock();
    // clearAllMocks keeps an earlier test's installed-host stub; this block needs the default missing host.
    chromeMock.runtime.connectNative.mockReset();
  });

  it('with no backend at all: the notice on other tabs, Get started instead of it on Backends', async () => {
    seedSettings({ onboardingDismissed: false });
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-status-bar="needs-key"]')).toBeTruthy();
    });
    expect(container.querySelector('[data-ega-get-started]')).toBeFalsy();
    expect(container.querySelector('[data-ega-status-jump-backends]')).toBeTruthy();
    await openBackends(container);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-get-started]')).toBeTruthy();
    });
    expect(container.querySelector('[data-ega-status-bar="needs-key"]')).toBeFalsy();
  });

  it('after Skip for now, the notice shows on Backends too, without its button', async () => {
    seedSettings({ onboardingDismissed: false });
    const { container } = render(Options);
    await openBackends(container);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-onboard="dismiss"]')).toBeTruthy();
    });
    await fireEvent.click(container.querySelector('[data-ega-onboard="dismiss"]') as HTMLElement);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-get-started]')).toBeFalsy();
      expect(container.querySelector('[data-ega-status-bar="needs-key"]')).toBeTruthy();
    });
    expect(container.querySelector('[data-ega-status-jump-backends]')).toBeFalsy();
  });

  it('the notice action opens the Backends tab and focuses the Get started card', async () => {
    seedSettings({ onboardingDismissed: false });
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-status-jump-backends]')).toBeTruthy();
    });
    await fireEvent.click(
      container.querySelector('[data-ega-status-jump-backends]') as HTMLElement,
    );
    await waitFor(() => {
      expect(document.activeElement?.closest('[data-ega-get-started]')).toBeTruthy();
    });
  });

  it('suppresses Get started when the native host is installed (READY without a key)', async () => {
    mockNativeHostInstalled();
    seedSettings({ onboardingDismissed: false });
    const { container } = render(Options);
    await openBackends(container);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-get-started]')).toBeFalsy();
    });
  });

  it('keeps onboarding hidden after a later storage change once the user picks a backend', async () => {
    // A reachable-but-disabled native host is the only state that renders onboarding.
    mockNativeHostInstalled();
    seedSettings({ onboardingDismissed: false, disabledBackends: ['native'] });
    const { container } = render(Options);
    await openBackends(container);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-get-started]')).toBeTruthy();
    });

    const gemini = container.querySelector<HTMLButtonElement>('[data-ega-onboard="gemini"]');
    expect(gemini).toBeTruthy();
    await fireEvent.click(gemini as HTMLButtonElement);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-get-started]')).toBeFalsy();
    });

    chromeMock.storage.local._fire({ 'ega.settings': { newValue: {} } });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-ega-get-started]')).toBeFalsy();
  });

  it('the Gemini CTA lands on the Backends tab with the Gemini card open and its key input focused', async () => {
    mockNativeHostInstalled();
    seedSettings({ onboardingDismissed: false, disabledBackends: ['native'] });
    const { container } = render(Options);
    await openBackends(container);
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

  it('suppresses Get started when an ollama URL is set on an enabled ollama', async () => {
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
    await openBackends(container);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-ega-get-started]')).toBeFalsy();
  });
});

describe('Options.svelte — palette task switches', () => {
  beforeEach(() => {
    resetProbeNativeHostForTest();
    resetChromeMock();
  });

  it('offers only tasks that are on', async () => {
    seedSettings({ disabledTasks: ['reword'], onboardingDismissed: true });
    const { container } = render(Options);
    await waitFor(() => expect(container.querySelector('[role="tab"]')).toBeTruthy());
    // Each Ctrl+K rebuilds the list from the settings read so far, so it repeats until they land.
    const texts = await waitFor(async () => {
      await fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      const opts = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent);
      if (!opts.some((t) => t.includes('Switch task: Summarize'))) throw new Error('no palette');
      return opts;
    });
    expect(texts.some((t) => t.includes('Switch task: Reword'))).toBe(false);
  });
});

describe('Options.svelte — palette lists custom tasks', () => {
  beforeEach(() => {
    resetProbeNativeHostForTest();
    resetChromeMock();
  });

  it('offers a custom task by name', async () => {
    seedSettings({ onboardingDismissed: true });
    chromeMock.storage.local._raw.set('ega.customTasks', [
      {
        id: 'c-tweet',
        label: 'Tweet summary',
        system: '',
        user: '{{text}}',
        output: 'plain',
        pageContext: false,
        image: false,
        glossary: false,
        createdAt: 1,
      },
    ]);
    const { container } = render(Options);
    await waitFor(() => expect(container.querySelector('[role="tab"]')).toBeTruthy());
    await waitFor(async () => {
      await fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      const opts = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent);
      expect(opts.some((t) => t.includes('Switch task: Tweet summary'))).toBe(true);
    });
  });
});

describe('Options.svelte — search jumps to the header Theme control', () => {
  beforeEach(() => {
    resetProbeNativeHostForTest();
    resetChromeMock();
  });

  it('Enter on "Theme" closes search and focuses the header theme control', async () => {
    seedSettings();
    const { container, findByPlaceholderText } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[data-ega-theme-toggle]')).toBeTruthy();
    });
    await fireEvent.keyDown(document, { key: ',', ctrlKey: true });
    const input = (await findByPlaceholderText('Search settings…')) as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'theme' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(document.activeElement?.closest('[data-ega-theme-toggle]')).toBeTruthy();
    });
    expect(document.activeElement?.getAttribute('aria-checked')).toBe('true');
  });
});
