// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import type { Settings } from '@/shared/types';

import Templates from '@/options/tabs/Templates.svelte';

const SETTINGS_KEY = 'ega.settings';

function seedDefaults(overrides: Record<string, unknown> = {}): Settings {
  const defaults = parseSettings({});
  const merged = { ...defaults, ...overrides } as Settings;
  chromeMock.storage.local._raw.set(SETTINGS_KEY, merged);
  return merged;
}

function mountTab(s: Settings) {
  return render(Templates, { props: { s, onSetSettings: () => {} } });
}

describe('Templates tab — top-level promotion', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('mounts the templates chip workbench', async () => {
    const seeded = seedDefaults();
    const { container } = mountTab(seeded);
    await new Promise((r) => setTimeout(r, 80));

    // AdvancedTemplatesPane renders a chip strip with data-ega-workbench-chip
    // anchors. At minimum the global chip must resolve.
    expect(container.querySelector('[data-ega-workbench-chip="global"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-workbench-chip="rules"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-workbench-chip="recipes"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-workbench-chip="snippets"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-workbench-chip="per-preset"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-prompt-workbench]')).not.toBeNull();
  });

  it('the compiled preview carries the rules and glossary blocks the request would carry', async () => {
    const defaults = parseSettings({});
    const seeded = seedDefaults({
      glossary: [{ term: 'kifak', translation: 'how are you', caseSensitive: false }],
      advanced: {
        ...defaults.advanced,
        rules: [
          {
            id: 'r1',
            body: 'Never soften a curse',
            category: 'never',
            scope: { tasks: [] },
            source: 'manual',
            addedAt: '2026-08-15T00:00:00.000Z',
            enabled: true,
          },
        ],
      },
    });
    const { container } = mountTab(seeded);
    await new Promise((r) => setTimeout(r, 80));

    const btn = container.querySelector('[data-ega-preview-prompt]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    await fireEvent.click(btn);

    const modal = await waitFor(() => {
      const el = document.querySelector('[data-ega-preview-modal]');
      if (!el) throw new Error('preview modal not rendered');
      return el;
    });
    expect(modal.textContent).toContain('- Never soften a curse');
    expect(modal.textContent).not.toContain('Never: Never');
    expect(modal.textContent).toContain('"kifak" → "how are you"');
  });

  it('renders TabHeader for the templates tab', async () => {
    const seeded = seedDefaults();
    const { container } = mountTab(seeded);
    await new Promise((r) => setTimeout(r, 80));
    expect(container.querySelector('[data-ega-tab="templates"]')).not.toBeNull();
  });
});
