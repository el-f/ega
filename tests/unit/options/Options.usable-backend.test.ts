// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import Options from '@/options/Options.svelte';
import { setFetchHandler } from '@tests/mocks/fetch';

const SETTINGS_KEY = 'ega.settings';

function seedSettings(overrides: Record<string, unknown> = {}): void {
  chromeMock.storage.local._raw.set(SETTINGS_KEY, parseSettings(overrides));
}

describe('Options.svelte — the no-backend warnings track what the router can use', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('keeps the needs-key bar up when the only key sits on a disabled backend', async () => {
    // openai ships disabled by default, so the router skips it and translation still fails.
    seedSettings({ onboardingDismissed: true, openaiApiKey: 'sk-test' });
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[role="tab"]')).toBeTruthy();
    });
    await waitFor(() => {
      expect(container.querySelector('[data-ega-status-bar="needs-key"]')).toBeTruthy();
    });
  });

  it('keeps onboarding up when the only key sits on a disabled backend', async () => {
    seedSettings({ onboardingDismissed: false, openaiApiKey: 'sk-test' });
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[role="tab"]')).toBeTruthy();
    });
    await waitFor(() => {
      expect(container.querySelector('[data-ega-status-bar="onboarding"]')).toBeTruthy();
    });
  });

  it('drops both warnings once the key lands on an enabled backend', async () => {
    seedSettings({ onboardingDismissed: false, openaiApiKey: 'sk-test', disabledBackends: [] });
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[role="tab"]')).toBeTruthy();
    });
    expect(container.querySelector('[data-ega-status-bar="onboarding"]')).toBeFalsy();
    expect(container.querySelector('[data-ega-status-bar="needs-key"]')).toBeFalsy();
  });

  describe('an enabled local server', () => {
    const seedLocalServer = (over: Record<string, unknown> = {}): void => {
      const defaults = parseSettings({});
      seedSettings({
        onboardingDismissed: true,
        theme: 'dark',
        disabledBackends: defaults.disabledBackends.filter((id) => id !== 'localserver'),
        ...over,
      });
    };
    // The stored theme lands in the same step as the settings the bar is derived from.
    const settled = (container: HTMLElement) =>
      waitFor(() => {
        expect(
          container.querySelector('[data-ega-theme="dark"][aria-checked="true"]'),
        ).toBeTruthy();
      });

    it('clears the bar once the server at the default address answers', async () => {
      const asked: string[] = [];
      setFetchHandler((url) => {
        asked.push(url);
        return Response.json({ data: [] });
      });
      seedLocalServer();
      const { container } = render(Options);
      await settled(container);
      await waitFor(() => {
        expect(asked).toContain('http://127.0.0.1:1234/v1/models');
        expect(container.querySelector('[data-ega-status-bar="needs-key"]')).toBeFalsy();
      });
    });

    it('keeps the bar while the server is not running', async () => {
      setFetchHandler(() => {
        throw new TypeError('Failed to fetch');
      });
      seedLocalServer();
      const { container } = render(Options);
      await waitFor(() => {
        expect(container.querySelector('[data-ega-status-bar="needs-key"]')).toBeTruthy();
      });
    });

    it('counts a saved URL as set up, like an Ollama URL', async () => {
      setFetchHandler(() => {
        throw new TypeError('Failed to fetch');
      });
      seedLocalServer({ localServerUrl: 'http://127.0.0.1:8080' });
      const { container } = render(Options);
      await settled(container);
      expect(container.querySelector('[data-ega-status-bar="needs-key"]')).toBeFalsy();
    });
  });

  it('keeps the warning up for an ollama URL on a disabled ollama', async () => {
    seedSettings({ onboardingDismissed: true, ollamaUrl: 'http://localhost:11434' });
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[role="tab"]')).toBeTruthy();
    });
    await waitFor(() => {
      expect(container.querySelector('[data-ega-status-bar="needs-key"]')).toBeTruthy();
    });
  });
});

describe('Options.svelte — Alt+digit tab switching', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('switches tab on Alt+2 when the layout gives key a non-digit character', async () => {
    seedSettings({ onboardingDismissed: true });
    const { container } = render(Options);
    await waitFor(() => {
      expect(container.querySelector('[role="tab"]')).toBeTruthy();
    });

    // macOS Option+2 on a US layout produces '™', never '2'.
    await fireEvent.keyDown(document, { key: '™', code: 'Digit2', altKey: true });
    await waitFor(() => {
      const selected = container.querySelector('[role="tab"][aria-selected="true"]');
      expect((selected?.textContent ?? '').trim()).toBe('Tasks');
    });
  });
});
