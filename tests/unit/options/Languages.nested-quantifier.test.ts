// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { resetChromeMock } from '../../mocks/chrome';
import { toastStore } from '@/shared/components/toastStore';
import type * as VarietiesModule from '@/shared/varieties';

// The editor has no pattern field of its own, so the refusal is driven from the writer it calls.
vi.mock('@/shared/varieties', async (importOriginal) => {
  const mod = await importOriginal<typeof VarietiesModule>();
  return {
    ...mod,
    updateVariety: vi.fn(async () => {
      throw new Error('nested-quantifier');
    }),
  };
});

const Languages = (await import('@/options/tabs/Languages.svelte')).default;

describe('Languages tab — a refused detection pattern', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
  });

  it('tells the user the pattern nests a repeat instead of echoing the error code', async () => {
    const pushed: Array<{ message: string; variant?: string }> = [];
    vi.spyOn(toastStore, 'push').mockImplementation((m) => {
      pushed.push(m);
    });
    render(Languages);

    const editBtn = await waitFor(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        '.variety-actions button[aria-label="Edit"]',
      );
      if (!btn) throw new Error('edit button not found');
      return btn;
    });
    await fireEvent.click(editBtn);
    const hint = await waitFor(() => {
      const el = document.querySelector<HTMLTextAreaElement>('textarea[id^="hint-"]');
      if (!el) throw new Error('hint field not found');
      return el;
    });
    // An unchanged built-in never reaches the writer.
    await fireEvent.input(hint, { target: { value: 'changed hint' } });
    const save = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.variety-commit-row button'),
    ).find((b) => b.textContent.trim() === 'Save');
    if (!save) throw new Error('save button not found');
    await fireEvent.click(save);

    await waitFor(() => expect(pushed).toHaveLength(1));
    expect(pushed[0]?.variant).toBe('danger');
    expect(pushed[0]?.message).toContain('(a+)+');
    expect(pushed[0]?.message).not.toContain('nested-quantifier');
  });
});
