// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showBanner } from '@/content/banner';
import { getShadowRoot, mountShadowHost } from '@/content/shadowHost';

function bannerCount(): number {
  return getShadowRoot().querySelectorAll('[data-ega-banner]').length;
}

describe('showBanner', () => {
  beforeEach(() => {
    mountShadowHost();
  });

  afterEach(() => {
    document.getElementById('ega-shadow-host')?.remove();
  });

  it('keeps a replacement banner shown by its dismiss callback', () => {
    showBanner({
      message: 'First notice',
      onDismiss: () => {
        showBanner({ message: 'Replacement notice' });
      },
    });

    const dismiss = getShadowRoot().querySelector<HTMLButtonElement>('button');
    expect(dismiss).not.toBeNull();
    dismiss?.click();

    expect(bannerCount()).toBe(1);
    expect(getShadowRoot().textContent).toContain('Replacement notice');
  });

  it('the action closes the banner, counts as dismissed, and runs', () => {
    const onDismiss = vi.fn();
    const run = vi.fn();
    showBanner({ message: 'Notice', onDismiss, action: { label: 'Open settings', run } });

    const buttons = Array.from(getShadowRoot().querySelectorAll<HTMLButtonElement>('button'));
    expect(buttons.map((b) => b.textContent.trim())).toEqual(['Open settings', 'Dismiss']);
    buttons[0]?.click();

    expect(run).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(bannerCount()).toBe(0);
  });

  it('a banner with no action shows only Dismiss', () => {
    showBanner({ message: 'Notice' });
    expect(getShadowRoot().querySelectorAll('button')).toHaveLength(1);
  });
});
