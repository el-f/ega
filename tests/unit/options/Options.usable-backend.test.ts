// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import Options from '@/options/Options.svelte';

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
      expect((selected?.textContent ?? '').trim()).toBe('Selection & picker');
    });
  });
});
