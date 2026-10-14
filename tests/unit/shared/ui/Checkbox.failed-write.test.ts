// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import Harness from '@tests/_helpers/CheckboxSaveHarness.svelte';

// Spec 3.0: a tab re-asserts the stored settings after a failed write, and the box must follow it back.
describe('Checkbox — a write that does not land', () => {
  it('goes back to the stored value when the page re-asserts it', async () => {
    const save = vi.fn(async () => false);
    const { getByRole } = render(Harness, { props: { save } });
    const box = getByRole('checkbox', { name: 'Show confidence pill' }) as HTMLInputElement;
    await fireEvent.click(box);
    await waitFor(() => {
      expect(save).toHaveBeenCalledWith(false);
    });
    await waitFor(() => {
      expect(box.checked).toBe(true);
    });
  });

  it('keeps the click when the write lands (positive control)', async () => {
    const save = vi.fn(async () => true);
    const { getByRole } = render(Harness, { props: { save } });
    const box = getByRole('checkbox', { name: 'Show confidence pill' }) as HTMLInputElement;
    await fireEvent.click(box);
    await waitFor(() => {
      expect(save).toHaveBeenCalledWith(false);
    });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(box.checked).toBe(false);
  });
});
