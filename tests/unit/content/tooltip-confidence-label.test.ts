// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import Tooltip from '@/content/Tooltip.svelte';

// A plain <span> has the generic role, and ARIA drops aria-label there.
describe('tooltip confidence pill', () => {
  it('carries a role, so the label reaches the screen reader', () => {
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
    const pill = container.querySelector('.pill');
    expect(pill).not.toBeNull();
    expect(pill?.getAttribute('aria-label')).toBe('Translation confidence 87%');
    expect(pill?.getAttribute('role')).toBe('img');
  });
});
