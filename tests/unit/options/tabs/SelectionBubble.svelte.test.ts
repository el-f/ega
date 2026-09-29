// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';
import type { Settings } from '@/shared/types';

import SelectionBubble from '@/options/tabs/SelectionBubble.svelte';

const SETTINGS_KEY = 'ega.settings';

function seedDefaults(overrides: Record<string, unknown> = {}): Settings {
  const defaults = parseSettings({});
  const merged = { ...defaults, ...overrides } as Settings;
  chromeMock.storage.local._raw.set(SETTINGS_KEY, merged);
  return merged;
}

function mountTab(s: Settings) {
  return render(SelectionBubble, { props: { s, onSetSettings: () => {} } });
}

describe('SelectionBubble tab — section composition', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('mounts mode + picker section anchors', async () => {
    const seeded = seedDefaults({ bubbleMode: 'smart', pickerEnabled: true });
    const { container } = mountTab(seeded);
    await new Promise((r) => setTimeout(r, 60));

    expect(container.querySelector('[name="bubbleMode"]')).not.toBeNull();
    expect(
      container.querySelector('[data-ega-setting="advanced.smartBubbleMinLength"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-ega-setting="display.pickerEnabled"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-setting="display.pickerShortcut"]')).not.toBeNull();
    expect(container.querySelector('[data-ega-setting="display.shortcut"]')).not.toBeNull();
  });

  it('hides the smart-bubble slider when bubbleMode is not smart', async () => {
    const seeded = seedDefaults({ bubbleMode: 'always' });
    const { container } = mountTab(seeded);
    await new Promise((r) => setTimeout(r, 60));
    expect(
      container.querySelector('[data-ega-setting="advanced.smartBubbleMinLength"]'),
    ).toBeNull();
  });

  it('does not mount settings sections before settings are available', () => {
    const { container } = render(SelectionBubble, { props: { s: null, onSetSettings: () => {} } });
    expect(container.querySelector('[data-ega-tab="selection-bubble"]')).not.toBeNull();
    expect(container.querySelector('[name="bubbleMode"]')).toBeNull();
    expect(container.querySelector('[data-ega-setting]')).toBeNull();
  });
});
