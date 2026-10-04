// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { createRawSnippet, type Snippet } from 'svelte';
import Popover from '@/shared/ui/Popover.svelte';
import { textSnippet } from './_helpers';

function buttonSnippet(label: string): Snippet {
  // A focusable child so the focus-move-in assertion has a real target.
  return createRawSnippet(() => ({
    render: () => `<button type="button" data-ega-inner>${label}</button>`,
  }));
}

describe('Popover', () => {
  it('renders children when open', () => {
    const { getByText } = render(Popover, {
      props: {
        open: true,
        anchor: document.body,
        onClose: () => {},
        children: textSnippet('popover content'),
      },
    });
    expect(getByText('popover content')).toBeTruthy();
  });

  it('does not render when closed', () => {
    const { queryByText } = render(Popover, {
      props: {
        open: false,
        anchor: document.body,
        onClose: () => {},
        children: textSnippet('popover content'),
      },
    });
    expect(queryByText('popover content')).toBeNull();
  });

  it('does not render when the anchor is null', () => {
    const { queryByText } = render(Popover, {
      props: {
        open: true,
        anchor: null,
        onClose: () => {},
        children: textSnippet('popover content'),
      },
    });
    expect(queryByText('popover content')).toBeNull();
  });

  it('exposes role=dialog named by the title', () => {
    const { getByRole } = render(Popover, {
      props: {
        open: true,
        anchor: document.body,
        onClose: () => {},
        title: 'Automatic retries',
        children: textSnippet('x'),
      },
    });
    expect(getByRole('dialog', { name: 'Automatic retries' })).toBeTruthy();
  });

  // A <header> outside main/section is a page banner, so the popover head would add a second one.
  it('adds no banner landmark to the page', () => {
    const { getByRole, queryByRole } = render(Popover, {
      props: {
        open: true,
        anchor: document.body,
        onClose: () => {},
        title: 'Automatic retries',
        children: textSnippet('x'),
      },
    });
    expect(getByRole('dialog').querySelector('.ega-popover-head')).not.toBeNull();
    expect(queryByRole('banner')).toBeNull();
  });

  it('Escape key fires onClose', async () => {
    const onClose = vi.fn();
    render(Popover, {
      props: {
        open: true,
        anchor: document.body,
        onClose,
        children: textSnippet('x'),
      },
    });
    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  // Real consumers keep Popover mounted and only toggle `open`.
  it('moves focus into the popover on false->true, restores on true->false', async () => {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const props = {
      open: false,
      anchor: document.body,
      onClose: () => {},
      children: buttonSnippet('inner'),
    };
    const { rerender, baseElement } = render(Popover, { props });

    expect(baseElement.querySelector('.ega-popover')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await rerender({ ...props, open: true });
    const popover = baseElement.querySelector('.ega-popover');
    expect(popover).not.toBeNull();
    // jsdom has no layout, so tabbable falls back to the container — assert containment.
    await waitFor(() => {
      expect(popover?.contains(document.activeElement)).toBe(true);
    });

    await rerender({ ...props, open: false });
    expect(baseElement.querySelector('.ega-popover')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });

  it('restores focus with preventScroll to avoid a scroll jump', async () => {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    document.body.appendChild(trigger);
    trigger.focus();
    const focusSpy = vi.spyOn(trigger, 'focus');

    const props = {
      open: false,
      anchor: document.body,
      onClose: () => {},
      children: buttonSnippet('inner'),
    };
    const { rerender } = render(Popover, { props });
    await rerender({ ...props, open: true });
    focusSpy.mockClear();

    await rerender({ ...props, open: false });
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });

    focusSpy.mockRestore();
    trigger.remove();
  });
});
