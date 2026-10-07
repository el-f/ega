// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import ShortcutOverlay from '@/shared/components/ShortcutOverlay.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { SETTINGS_TABS } from '@/shared/settings-tabs';

// Both rows are rebindable settings; a hardcoded chord is wrong once the user rebinds it.

function rowFor(container: HTMLElement, term: string): string {
  const rows = Array.from(container.querySelectorAll('.shortcut-row'));
  const row = rows.find((r) => (r.querySelector('dt')?.textContent ?? '').includes(term));
  return row?.querySelector('dd')?.textContent ?? '';
}

function pretendMac(): void {
  Object.defineProperty(navigator, 'userAgentData', {
    value: { platform: 'macOS' },
    configurable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'userAgentData');
});

describe('ShortcutOverlay reads the real bindings', () => {
  it('shows a rebound translate chord', () => {
    const { container } = render(ShortcutOverlay, {
      props: { open: true, onClose: () => {}, shortcut: 'Alt+Shift+Y' },
    });
    const dd = rowFor(container as HTMLElement, 'Translate selection');
    expect(dd).toContain('Alt');
    expect(dd).toContain('Shift');
    expect(dd).toContain('Y');
    expect(dd).not.toContain('Ctrl');
  });

  it('shows a rebound picker chord', () => {
    const { container } = render(ShortcutOverlay, {
      props: { open: true, onClose: () => {}, pickerShortcut: 'Ctrl+Alt+P' },
    });
    const dd = rowFor(container as HTMLElement, 'Start the element picker');
    expect(dd).toContain('Alt');
    expect(dd).toContain('P');
    expect(dd).not.toContain('E');
  });

  it('falls back to the shipped defaults when no settings are passed', () => {
    const { container } = render(ShortcutOverlay, { props: { open: true, onClose: () => {} } });
    expect(rowFor(container as HTMLElement, 'Translate selection').replace(/\+/g, '')).toBe(
      DEFAULT_SETTINGS.shortcut.split('+').join(''),
    );
  });

  it('says the shortcut is unset instead of rendering an empty key', () => {
    const { container } = render(ShortcutOverlay, {
      props: { open: true, onClose: () => {}, shortcut: '' },
    });
    expect(rowFor(container as HTMLElement, 'Translate selection')).toMatch(/not set/i);
  });

  it('keeps Ctrl on macOS, because the content script matches ctrlKey literally', () => {
    pretendMac();
    const { container } = render(ShortcutOverlay, {
      props: { open: true, onClose: () => {}, shortcut: 'Ctrl+Shift+L' },
    });
    expect(rowFor(container as HTMLElement, 'Translate selection')).toContain('Ctrl');
  });

  it('renders a stored Command binding as the mac glyph', () => {
    pretendMac();
    const { container } = render(ShortcutOverlay, {
      props: { open: true, onClose: () => {}, shortcut: 'Command+Shift+L' },
    });
    expect(rowFor(container as HTMLElement, 'Translate selection')).toContain('⌘');
  });
});

describe('ShortcutOverlay lists the keys each surface really has', () => {
  it('the side panel sends with Enter, and Shift+Enter starts a new line', () => {
    const { container } = render(ShortcutOverlay, {
      props: { open: true, onClose: () => {}, surface: 'sidepanel' },
    });
    expect(rowFor(container as HTMLElement, 'Send').replace(/\s+/g, '')).toBe('Enter');
    expect(rowFor(container as HTMLElement, 'New line').replace(/\s+/g, '')).toBe('Shift+Enter');
  });

  it('options switches as many tabs as it has, with Alt and the tab number', () => {
    const { container } = render(ShortcutOverlay, {
      props: { open: true, onClose: () => {}, surface: 'options' },
    });
    const terms = Array.from(container.querySelectorAll('.shortcut-row dt')).map(
      (d) => d.textContent,
    );
    expect(terms).toContain(`Switch Settings tab (1–${SETTINGS_TABS.length})`);
    expect(rowFor(container as HTMLElement, 'Switch Settings tab')).toContain(
      String(SETTINGS_TABS.length),
    );
  });
});
