// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { dropChipRetry, mountErrorChip } from '@/content/page-chip';

afterEach(() => {
  document.body.innerHTML = '';
});

function css(host: HTMLElement): string {
  return host.shadowRoot?.querySelector('style')?.textContent ?? '';
}

describe('the page error chip', () => {
  it('sets its own margin and reset inline, so a page rule on every element cannot undo them', () => {
    const host = mountErrorChip({ code: 'UNKNOWN', message: 'x' });
    expect(host.style.getPropertyValue('margin-inline-start')).toBe('0.4em');
    expect(host.style.getPropertyValue('vertical-align')).toBe('middle');
    // The page's letter-spacing and text effects never reach the chip text.
    expect(css(host)).toMatch(
      /\.chip\{[^}]*letter-spacing:normal;word-spacing:normal;text-transform:none;text-shadow:none/,
    );
  });

  it('keeps a red band next to the white focus ring, so the ring shows on a white page', () => {
    const host = mountErrorChip({ code: 'UNKNOWN', message: 'x' }, { onRetry: vi.fn() });
    expect(css(host)).toMatch(
      /button:focus-visible\{outline:2px solid #fff;outline-offset:2px;box-shadow:0 0 0 4px #b3242a\}/,
    );
  });

  it('a page-translate chip is not an alert: the pill already says what failed', () => {
    const host = mountErrorChip({ code: 'AUTH', message: '401' });
    expect(host.hasAttribute('role')).toBe(false);
    expect(host.shadowRoot?.querySelector('.sr')).toBeNull();
  });

  it('after a settings change a settings error offers Try again instead of Open settings', () => {
    const retry = vi.fn();
    const before = mountErrorChip({ code: 'AUTH', message: '401' }, { onRetry: retry });
    expect(before.shadowRoot?.querySelector('[data-ega-chip-settings]')).not.toBeNull();
    const after = mountErrorChip(
      { code: 'QUOTA', message: '402' },
      { onRetry: retry, settingsChanged: true },
    );
    const button = after.shadowRoot?.querySelector<HTMLButtonElement>('[data-ega-retry-block]');
    expect(button?.textContent).toBe('Try again');
    button?.click();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('dropping Try again keeps Open settings, and a chip left with no button gets its end padding', () => {
    const settings = mountErrorChip({ code: 'AUTH', message: '401' }, { onRetry: vi.fn() });
    dropChipRetry(settings);
    expect(settings.shadowRoot?.querySelector('[data-ega-chip-settings]')).not.toBeNull();
    expect(settings.shadowRoot?.querySelector('.chip')?.classList.contains('bare')).toBe(false);

    const retry = mountErrorChip({ code: 'UNKNOWN', message: 'x' }, { onRetry: vi.fn() });
    dropChipRetry(retry);
    expect(retry.shadowRoot?.querySelector('button')).toBeNull();
    expect(retry.shadowRoot?.querySelector('.chip')?.classList.contains('bare')).toBe(true);
  });
});
