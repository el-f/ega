// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import Tooltip from '@/content/Tooltip.svelte';

// A plain <span> has the generic role, and ARIA drops aria-label there.
describe('tooltip confidence metadata', () => {
  it('uses readable text in the shared metadata line', () => {
    const { container } = render(Tooltip, {
      props: {
        tip: {
          srcText: 'hello',
          body: 'shalom',
          loading: false,
          confidence: 0.87,
          confidencePill: true,
          left: 10,
          top: 10,
        },
        clickOutsideDismiss: true,
        onclose: vi.fn(),
        oncancel: vi.fn(),
        onretry: vi.fn(),
        oncopy: vi.fn(),
        onexplain: vi.fn(),
        onopenoptions: vi.fn(),
      },
    });
    const confidence = container.querySelector('[data-ega-meta-item="confidence"]');
    expect(confidence?.textContent).toBe('87% confident');
    expect(confidence?.closest('[data-ega-reply-meta]')).not.toBeNull();
  });
});
