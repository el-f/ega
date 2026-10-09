// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import Dialog from '@/shared/ui/Dialog.svelte';
import ConfirmDialog from '@/shared/components/ConfirmDialog.svelte';
import { textSnippet } from './_helpers';

function description(dialog: HTMLElement): string {
  const ids = (dialog.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  return ids.map((i) => document.getElementById(i)?.textContent.trim() ?? '').join(' ');
}

describe('Dialog — what a screen reader hears on open (K-13)', () => {
  it('reads the help line as the dialog description', () => {
    const { getByRole } = render(Dialog, {
      props: {
        open: true,
        title: 'Summarize task',
        focusTitle: true,
        onClose: () => {},
        help: textSnippet('Summarize the text in 1-3 sentences'),
        children: textSnippet('fields'),
      },
    });
    expect(description(getByRole('dialog'))).toBe('Summarize the text in 1-3 sentences');
  });

  it('has no description when there is no help line', () => {
    const { getByRole } = render(Dialog, {
      props: {
        open: true,
        title: 'Search settings',
        onClose: () => {},
        children: textSnippet('x'),
      },
    });
    expect(getByRole('dialog').hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('ConfirmDialog — the safe button and the body (spec 5.1, 5.5)', () => {
  const props = {
    open: true,
    title: 'Close without this change?',
    body: 'Your last change to the message is not valid, so it was not saved.',
    confirmLabel: 'Close anyway',
    cancelLabel: 'Keep editing',
    onConfirm: () => {},
    onCancel: () => {},
  };

  it('opens with focus on the safe button, not on the close X', async () => {
    const { getByRole } = render(ConfirmDialog, { props });
    await waitFor(() => {
      expect(document.activeElement).toBe(getByRole('button', { name: 'Keep editing' }));
    });
  });

  it('opens on the typed field when the confirm asks for typed text', async () => {
    const { getByLabelText } = render(ConfirmDialog, {
      props: { ...props, typeToConfirm: 'EXPORT KEYS' },
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(getByLabelText('Type to confirm'));
    });
  });

  it('reads the body as the dialog description', () => {
    const { getByRole } = render(ConfirmDialog, { props });
    expect(description(getByRole('dialog'))).toBe(props.body);
  });
});
