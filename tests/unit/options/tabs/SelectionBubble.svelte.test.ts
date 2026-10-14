// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
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
    expect(container.querySelector('[name="bubbleMode"]')).not.toBeNull();
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

  it('saves a change and hands the saved settings back to the page', async () => {
    const seeded = seedDefaults({ bubbleMode: 'smart' });
    const onSetSettings = vi.fn();
    const { getByRole } = render(SelectionBubble, { props: { s: seeded, onSetSettings } });
    const always = getByRole('radio', { name: /^Always/ });
    await fireEvent.click(always);
    await vi.waitFor(() => expect(onSetSettings).toHaveBeenCalled());
    expect(onSetSettings.mock.calls[0]?.[0]).toMatchObject({ bubbleMode: 'always' });
  });
});

// Spec 3.0, R1-01: a write that does not land puts the stored value back on screen.
describe('SelectionBubble tab — a write that does not land', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('shows the stored value again, so the box the user clicked goes back', async () => {
    const seeded = seedDefaults({ pickerEnabled: true });
    const utils = render(SelectionBubble, {
      props: { s: seeded, onSetSettings: (next: Settings) => void utils.rerender({ s: next }) },
    });
    const box = utils.getByRole('checkbox', {
      name: 'Turn on the element picker',
    }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('disk full'));
    await fireEvent.click(box);
    await vi.waitFor(() => expect(box.checked).toBe(true));
    expect(chromeMock.storage.local._raw.get(SETTINGS_KEY)).toMatchObject({ pickerEnabled: true });
  });
});
