// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { toastStore } from '@/shared/components/toastStore';
import { getCustomLanguages } from '@/shared/storage';

const Languages = (await import('@/options/tabs/Languages.svelte')).default;

describe('Languages tab — a refused detection pattern', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
  });

  it('tells the user the pattern nests a repeat instead of echoing the error code', async () => {
    chromeMock.storage.local._raw.set('ega.customLanguages', [
      { id: 'nq-id', label: 'Nested', hint: 'h', examples: [], createdAt: 1 },
    ]);
    const pushed: Array<{ message: string; variant?: string }> = [];
    vi.spyOn(toastStore, 'push').mockImplementation((m) => {
      pushed.push(m);
    });
    render(Languages);

    const editBtn = await waitFor(() => {
      const row = [...document.querySelectorAll('.variety-row')].find((r) =>
        r.textContent.includes('Nested'),
      );
      const btn = row?.querySelector<HTMLButtonElement>('button[aria-label="Edit"]');
      if (!btn) throw new Error('edit button not found');
      return btn;
    });
    await fireEvent.click(editBtn);
    await fireEvent.click(
      await waitFor(() => {
        const t = document.querySelector<HTMLButtonElement>('.variety-advanced-toggle');
        if (!t) throw new Error('advanced toggle not found');
        return t;
      }),
    );
    const pattern = await waitFor(() => {
      const el = document.getElementById('detect-nq-id');
      if (!(el instanceof HTMLInputElement)) throw new Error('pattern field not found');
      return el;
    });
    await fireEvent.input(pattern, { target: { value: '(a+)+' } });
    const save = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.variety-commit-row button'),
    ).find((b) => b.textContent.trim() === 'Save language');
    if (!save) throw new Error('save button not found');
    await fireEvent.click(save);

    await waitFor(() => expect(pushed).toHaveLength(1));
    expect(pushed[0]?.variant).toBe('danger');
    expect(pushed[0]?.message).toMatch(/can take too long/);
    expect(pushed[0]?.message).not.toContain('slow-pattern');
    expect((await getCustomLanguages())[0]?.autoDetect).toBeUndefined();
  });
});
