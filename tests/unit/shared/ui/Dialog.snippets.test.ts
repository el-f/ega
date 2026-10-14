// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Dialog from '@/shared/ui/Dialog.svelte';
import { textSnippet } from './_helpers';

describe('Dialog — title / help / actions snippets', () => {
  it('renders the title snippet as the dialog heading', () => {
    const { getByRole } = render(Dialog, {
      props: {
        open: true,
        onClose: vi.fn(),
        title: 'Compare audit entries',
        children: textSnippet('body'),
      },
    });
    const heading = getByRole('heading');
    expect(heading.textContent).toContain('Compare audit entries');
    expect(heading.classList.contains('ega-dialog-title')).toBe(true);
  });

  it('renders a close button beside the title that calls onClose', async () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(Dialog, {
      props: {
        open: true,
        onClose,
        title: 'Heading',
        children: textSnippet('body'),
      },
    });
    await fireEvent.click(getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders no heading and no close button without a title snippet', () => {
    const { queryByRole, queryByLabelText } = render(Dialog, {
      props: { open: true, label: 'x', onClose: vi.fn(), children: textSnippet('body') },
    });
    expect(queryByRole('heading')).toBeNull();
    expect(queryByLabelText('Close')).toBeNull();
  });

  it('renders help above the children and actions below them', () => {
    const { container } = render(Dialog, {
      props: {
        open: true,
        onClose: vi.fn(),
        title: 'T',
        help: textSnippet('Older entry on the left.'),
        actions: textSnippet('ACTIONS'),
        children: textSnippet('BODY'),
      },
    });
    const panel = container.querySelector('.ega-dialog') as HTMLElement;
    expect(panel.querySelector('.ega-dialog-help')?.textContent).toContain(
      'Older entry on the left.',
    );
    const text = panel.textContent;
    expect(text.indexOf('Older entry on the left.')).toBeLessThan(text.indexOf('BODY'));
    expect(text.indexOf('BODY')).toBeLessThan(text.indexOf('ACTIONS'));
    expect(panel.querySelector('.ega-dialog-actions')?.textContent).toContain('ACTIONS');
  });
});
