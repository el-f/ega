// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import Backends from '@/options/tabs/Backends.svelte';
import { parseSettings } from '@/shared/settings-schema';

describe('Get started card', () => {
  it('Skip for now hands focus to Backends in use, not the page', async () => {
    const utils = render(Backends, {
      props: {
        s: parseSettings({}),
        onSetSettings: () => {},
        getStarted: {
          onUseGemini: vi.fn(),
          onUseOtherKey: vi.fn(),
          onRunLocal: vi.fn(),
          onSkip: () => void utils.rerender({ getStarted: null }),
        },
      },
    });
    const skip = await waitFor(() => {
      const el = utils.container.querySelector<HTMLElement>('[data-ega-onboard="dismiss"]');
      if (!el) throw new Error('no Skip button');
      return el;
    });
    skip.focus();
    await fireEvent.click(skip);
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Backends in use'));
  });
});
