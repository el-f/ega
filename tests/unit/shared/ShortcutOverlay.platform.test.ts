// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import ShortcutOverlay from '@/shared/components/ShortcutOverlay.svelte';

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

describe('ShortcutOverlay — platform-correct modifiers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'userAgentData');
  });

  // Only the Options chords swap; the content script matches the stored binding literally.
  it('shows the Command modifier on macOS for a chord the page accepts either way', () => {
    pretendMac();
    const { container } = render(ShortcutOverlay, {
      props: { open: true, onClose: () => {}, surface: 'options' },
    });
    const dd = rowFor(container as HTMLElement, 'Add a rule');
    expect(dd).toContain('⌘');
    expect(dd).not.toContain('Ctrl');
  });

  it('shows Ctrl for Translate selection off macOS', () => {
    const { container } = render(ShortcutOverlay, { props: { open: true, onClose: () => {} } });
    expect(rowFor(container as HTMLElement, 'Translate selection')).toContain('Ctrl');
  });

  it('hides the Options tab chord on surfaces that cannot run it', () => {
    const { container } = render(ShortcutOverlay, {
      props: { open: true, onClose: () => {}, surface: 'sidepanel' },
    });
    expect(rowFor(container as HTMLElement, 'Switch Options tab')).toBe('');
  });
});
