// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { createRawSnippet, type Snippet } from 'svelte';
import Popover from '@/shared/ui/Popover.svelte';
import { readFileSync } from 'node:fs';
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

  // A non-modal popover left open would cover the controls Tab moves to (WCAG 2.4.11).
  it('closes when focus moves to a control outside it, but not when focus goes back to its anchor', async () => {
    const anchor = document.createElement('button');
    anchor.type = 'button';
    const outside = document.createElement('button');
    outside.type = 'button';
    document.body.append(anchor, outside);
    anchor.focus();
    const onClose = vi.fn();
    const { baseElement } = render(Popover, {
      props: { open: true, anchor, onClose, children: buttonSnippet('inner') },
    });
    const popover = baseElement.querySelector('.ega-popover');
    await waitFor(() => expect(popover?.contains(document.activeElement)).toBe(true));

    // A menu that opened this popover hands focus back to the anchor as it closes.
    anchor.focus();
    await new Promise((r) => setTimeout(r, 20));
    expect(onClose).not.toHaveBeenCalled();

    outside.focus();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    anchor.remove();
    outside.remove();
  });

  it('leaves focus where an outside click put it, so typing in the message box keeps working', async () => {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    const field = document.createElement('textarea');
    document.body.append(trigger, field);
    trigger.focus();

    const props = {
      open: false,
      anchor: document.body,
      onClose: () => {},
      children: buttonSnippet('inner'),
    };
    const { rerender, baseElement } = render(Popover, { props });
    await rerender({ ...props, open: true });
    const popover = baseElement.querySelector('.ega-popover');
    await waitFor(() => {
      expect(popover?.contains(document.activeElement)).toBe(true);
    });

    // A popover without a scrim does not trap focus: the click into the field keeps it.
    field.focus();
    await waitFor(() => {
      expect(document.activeElement).toBe(field);
    });
    await rerender({ ...props, open: false });
    expect(document.activeElement).toBe(field);

    trigger.remove();
    field.remove();
  });

  // jsdom has no cascade: the rule is pinned in the source, and the captures show the box with no ring.
  it('draws no focus ring around the popover box, which takes focus when it opens', () => {
    const src = readFileSync('src/shared/ui/Popover.svelte', 'utf8');
    expect(src).toMatch(/:global\(\.ega-popover:focus-visible\)\s*\{\s*outline:\s*none;/);
  });
});
