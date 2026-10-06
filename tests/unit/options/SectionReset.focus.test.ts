// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import Harness from '@tests/_helpers/SectionResetHarness.svelte';

describe('SectionReset focus (K-9)', () => {
  it('after a reset hides the pill, focus moves to the card title, not the page', async () => {
    const { getByRole } = render(Harness);
    const pill = getByRole('button', { name: 'Reset section to defaults' });
    pill.focus();
    await fireEvent.click(pill);
    await waitFor(() =>
      expect(document.activeElement).toBe(getByRole('heading', { name: 'Where answers show' })),
    );
  });
});
