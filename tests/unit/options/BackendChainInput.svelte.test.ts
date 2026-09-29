// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import BackendChainInput from '@/options/components/BackendChainInput.svelte';

const POOL = ['anthropic', 'openai', 'gemini', 'groq', 'deepseek'] as const;

describe('BackendChainInput', () => {
  it('renders one chip per selected id with up/down/remove buttons', () => {
    const { container } = render(BackendChainInput, {
      props: {
        value: ['anthropic', 'gemini'],
        options: POOL,
        onChange: () => {},
      },
    });
    const chips = container.querySelectorAll('[data-ega-backend-chain-chip]');
    expect(chips.length).toBe(2);
    expect(chips[0]?.getAttribute('data-ega-backend-chain-chip')).toBe('anthropic');
    expect(chips[1]?.getAttribute('data-ega-backend-chain-chip')).toBe('gemini');
  });

  it('removeAt removes the chip and emits onChange without it', async () => {
    let next: readonly string[] | null = null;
    const { container } = render(BackendChainInput, {
      props: {
        value: ['anthropic', 'gemini'],
        options: POOL,
        onChange: (n: readonly string[]) => {
          next = n;
        },
      },
    });
    const remove = container.querySelector(
      '[data-ega-backend-chain-chip="anthropic"] [data-ega-backend-chain-remove]',
    ) as HTMLButtonElement;
    expect(remove).not.toBeNull();
    await fireEvent.click(remove);
    expect(next).toEqual(['gemini']);
  });

  it('moveUp swaps the chip with the one before it', async () => {
    let next: readonly string[] | null = null;
    const { container } = render(BackendChainInput, {
      props: {
        value: ['anthropic', 'gemini', 'openai'],
        options: POOL,
        onChange: (n: readonly string[]) => {
          next = n;
        },
      },
    });
    const up = container.querySelector(
      '[data-ega-backend-chain-chip="openai"] [data-ega-backend-chain-move-up]',
    ) as HTMLButtonElement;
    await fireEvent.click(up);
    expect(next).toEqual(['anthropic', 'openai', 'gemini']);
  });

  it('moveDown swaps the chip with the one after it', async () => {
    let next: readonly string[] | null = null;
    const { container } = render(BackendChainInput, {
      props: {
        value: ['anthropic', 'gemini', 'openai'],
        options: POOL,
        onChange: (n: readonly string[]) => {
          next = n;
        },
      },
    });
    const down = container.querySelector(
      '[data-ega-backend-chain-chip="anthropic"] [data-ega-backend-chain-move-down]',
    ) as HTMLButtonElement;
    await fireEvent.click(down);
    expect(next).toEqual(['gemini', 'anthropic', 'openai']);
  });

  it('first chip has move-up disabled, last has move-down disabled', () => {
    const { container } = render(BackendChainInput, {
      props: {
        value: ['anthropic', 'gemini', 'openai'],
        options: POOL,
        onChange: () => {},
      },
    });
    const firstUp = container.querySelector(
      '[data-ega-backend-chain-chip="anthropic"] [data-ega-backend-chain-move-up]',
    ) as HTMLButtonElement;
    expect(firstUp.disabled).toBe(true);
    const lastDown = container.querySelector(
      '[data-ega-backend-chain-chip="openai"] [data-ega-backend-chain-move-down]',
    ) as HTMLButtonElement;
    expect(lastDown.disabled).toBe(true);
  });
});
