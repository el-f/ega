// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import type * as SettingsTabs from '@/shared/settings-tabs';

// Settings can rename a tab; the popup must follow the one source of tab names, never a copy.
vi.mock('@/shared/settings-tabs', async (importOriginal) => {
  const real = await importOriginal<typeof SettingsTabs>();
  return { ...real, TAB_LABELS: { ...real.TAB_LABELS, 'selection-bubble': 'Renamed tab' } };
});

const { default: PopupTools } = await import('@/popup/PopupTools.svelte');

describe('the picker-off reason', () => {
  it('names the Settings tab by its current label', () => {
    const { getByRole } = render(PopupTools, {
      props: {
        onTranslatePage: vi.fn(),
        onChooseAreas: vi.fn(),
        onPickElement: vi.fn(),
        onClipboard: vi.fn(),
        onOpenSidePanel: vi.fn(),
        pickerEnabled: false,
      },
    });
    const btn = getByRole('button', { name: /^Pick element/ });
    const reason = document.getElementById(btn.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toContain('Turn it on in Settings → Renamed tab.');
  });
});
