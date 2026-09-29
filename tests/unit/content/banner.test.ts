// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
});
