// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { createRawSnippet, type Snippet } from 'svelte';
import Dialog from '@/shared/ui/Dialog.svelte';
import { textSnippet } from './_helpers';

function buttonSnippet(label: string): Snippet {
  return createRawSnippet(() => ({
    render: () => `<button type="button">${label}</button>`,
  }));
}

describe('Dialog', () => {
  it('renders children when open', () => {
    const { getByText } = render(Dialog, {
      props: {
        open: true,
        label: 'Confirm',
        onClose: () => {},
        children: textSnippet('Are you sure?'),
      },
    });
    expect(getByText('Are you sure?')).toBeTruthy();
  });

  it('does not render when closed', () => {
    const { queryByText } = render(Dialog, {
      props: {
        open: false,
        label: 'Confirm',
        onClose: () => {},
        children: textSnippet('Are you sure?'),
      },
    });
    expect(queryByText('Are you sure?')).toBeNull();
  });

  it('renders exactly one role=dialog with the label', () => {
    const { getAllByRole, container } = render(Dialog, {
      props: {
        open: true,
        label: 'Delete term',
        onClose: () => {},
        children: textSnippet('x'),
      },
    });
    // The `.ega-dialog` panel itself carries role=dialog; the backdrop stays a plain button.
    const dialogs = getAllByRole('dialog');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]?.getAttribute('aria-label')).toBe('Delete term');
    expect(container.querySelector('.ega-dialog')).not.toBeNull();
  });

  // One name: a dialog with a heading is named BY that heading, so the two can never disagree.
  it('takes its accessible name from the visible heading', () => {
    const { getByRole } = render(Dialog, {
      props: {
        open: true,
        title: 'Compare audit entries',
        onClose: () => {},
        children: textSnippet('x'),
      },
    });
    const dialog = getByRole('dialog', { name: 'Compare audit entries' });
    expect(dialog.querySelector('h2')?.textContent).toBe('Compare audit entries');
    expect(dialog.getAttribute('aria-label')).toBeNull();
  });

  it('Escape fires onClose', async () => {
    const onClose = vi.fn();
    render(Dialog, {
      props: { open: true, label: 'x', onClose, children: textSnippet('x') },
    });
    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  // jsdom has no layout, so tabbable falls back to the container — assert containment, not the node.
  it('moves focus into the dialog when opened', async () => {
    const { getByRole } = render(Dialog, {
      props: {
        open: true,
        label: 'x',
        onClose: () => {},
        children: buttonSnippet('inner'),
      },
    });
    await waitFor(() => {
      expect(getByRole('dialog').contains(document.activeElement)).toBe(true);
    });
  });

  it('backdrop click triggers onClose', async () => {
    const onClose = vi.fn();
    const { container } = render(Dialog, {
      props: { open: true, label: 'x', onClose, children: textSnippet('x') },
    });
    const backdrop = container.querySelector('.ega-dialog-backdrop') as HTMLElement;
    await fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('applies size class', () => {
    const { container } = render(Dialog, {
      props: { open: true, size: 'lg', label: 'x', onClose: () => {}, children: textSnippet('x') },
    });
    expect(container.querySelector('.size-lg')).not.toBeNull();
  });

  it('dark theme scrim opacity is ≥ 0.7 so dialog body reads as elevated against the dimmed page', () => {
    const tokensPath = resolve(process.cwd(), 'src/shared/tokens.css');
    const source = readFileSync(tokensPath, 'utf8');
    const decls = [...source.matchAll(/--color-backdrop:\s*rgba\([^)]+\);/g)].map((m) => m[0]);
    expect(decls.length).toBeGreaterThanOrEqual(3);
    for (const decl of decls) {
      const inner = decl.replace(/^.*rgba\(/, '').replace(/\).*$/, '');
      const parts = inner.split(',').map((s) => s.trim());
      const r = Number(parts[0] ?? 'NaN');
      const alpha = Number(parts[parts.length - 1] ?? 'NaN');
      // The dark scrim is pure black; the light one is a slate tint at r=27.
      const isDark = r === 0;
      if (isDark) {
        expect(alpha, `dark scrim alpha in: ${decl}`).toBeGreaterThanOrEqual(0.7);
      }
    }
  });
});
