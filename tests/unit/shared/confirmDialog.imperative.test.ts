// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { confirmDialog } from '@/shared/components/confirmDialog';

/** The dialog is named by its heading, so the heading is what proves it is mounted. */
function headingWithText(text: string): Element | null {
  return [...document.querySelectorAll('h2')].find((h) => h.textContent.trim() === text) ?? null;
}

function clickByText(text: string): void {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
  if (!btn) throw new Error(`no button labeled "${text}"`);
  btn.click();
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('confirmDialog — teardown timing', () => {
  it('takes the modal out of the document before the caller resumes', async () => {
    const p = confirmDialog({ title: 'Delete rule', body: 'This cannot be undone.' });
    await Promise.resolve();
    expect(headingWithText('Delete rule')).not.toBeNull();

    clickByText('Cancel');
    await expect(p).resolves.toBe(false);

    expect(headingWithText('Delete rule')).toBeNull();
    expect(document.body.textContent).not.toContain('This cannot be undone.');
  });

  it('leaves focus set by the caller alone', async () => {
    const after = document.createElement('input');
    document.body.appendChild(after);

    // Fake timers, so every deferred focus restore the dialog left behind runs before the check.
    vi.useFakeTimers();
    try {
      const p = confirmDialog({ title: 'Delete term', body: 'Gone for good.' });
      await Promise.resolve();
      clickByText('Confirm');
      await p;
      after.focus();
      await vi.runAllTimersAsync();
    } finally {
      vi.useRealTimers();
    }
    expect(document.activeElement).toBe(after);
  });

  it('removes its host element', async () => {
    const before = document.body.childElementCount;
    const p = confirmDialog({ title: 'Purge', body: 'All data.' });
    await Promise.resolve();
    expect(document.body.childElementCount).toBe(before + 1);
    clickByText('Cancel');
    await p;

    expect(document.body.childElementCount).toBe(before);
  });
});
