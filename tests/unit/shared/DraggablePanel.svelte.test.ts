// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import DraggablePanel from '@/shared/components/DraggablePanel.svelte';

function textSnippet(html: string) {
  // createRawSnippet lets a plain test render arbitrary DOM as a Svelte 5
  // snippet — avoids needing a dedicated *.svelte fixture file.
  return createRawSnippet(() => ({
    render: () => html,
  }));
}

describe('DraggablePanel', () => {
  it('renders children inside the root', () => {
    const { container } = render(DraggablePanel, {
      props: {
        left: 10,
        top: 20,
        onClose: () => {},
        children: textSnippet('<span data-ega-test-child>hi</span>'),
      },
    });
    const child = container.querySelector('[data-ega-test-child]');
    expect(child).not.toBeNull();
    expect(child?.textContent).toBe('hi');
  });

  it('positions via left/top inline style', () => {
    const { container } = render(DraggablePanel, {
      props: {
        left: 42,
        top: 99,
        onClose: () => {},
        children: textSnippet('<span>x</span>'),
      },
    });
    const root = container.querySelector('.ega-draggable-panel') as HTMLElement;
    expect(root.style.left).toBe('42px');
    expect(root.style.top).toBe('99px');
  });

  it('adds the consumer-supplied class alongside ega-draggable-panel', () => {
    const { container } = render(DraggablePanel, {
      props: {
        left: 0,
        top: 0,
        class: 'tooltip',
        onClose: () => {},
        children: textSnippet('<span>x</span>'),
      },
    });
    const root = container.querySelector('.ega-draggable-panel') as HTMLElement;
    expect(root.classList.contains('tooltip')).toBe(true);
  });

  it('invokes onClose on Escape', async () => {
    let closed = 0;
    const { container } = render(DraggablePanel, {
      props: {
        left: 0,
        top: 0,
        onClose: () => {
          closed++;
        },
        children: textSnippet('<span>x</span>'),
      },
    });
    const root = container.querySelector('.ega-draggable-panel') as HTMLElement;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toBe(1);
  });

  it('honors role="dialog" + aria-label for screen readers', () => {
    const { container } = render(DraggablePanel, {
      props: {
        left: 0,
        top: 0,
        ariaLabel: 'Custom label',
        onClose: () => {},
        children: textSnippet('<span>x</span>'),
      },
    });
    const root = container.querySelector('.ega-draggable-panel') as HTMLElement;
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.getAttribute('aria-label')).toBe('Custom label');
  });

  it('defaults aria-label to "Panel" when not provided', () => {
    const { container } = render(DraggablePanel, {
      props: {
        left: 0,
        top: 0,
        onClose: () => {},
        children: textSnippet('<span>x</span>'),
      },
    });
    const root = container.querySelector('.ega-draggable-panel') as HTMLElement;
    expect(root.getAttribute('aria-label')).toBe('Panel');
  });

  it('is-draggable class matches the draggable prop', () => {
    const { container } = render(DraggablePanel, {
      props: {
        left: 0,
        top: 0,
        draggable: true,
        onClose: () => {},
        children: textSnippet('<span>x</span>'),
      },
    });
    const root = container.querySelector('.ega-draggable-panel') as HTMLElement;
    expect(root.classList.contains('is-draggable')).toBe(true);
  });

  it('clickOutsideDismiss=true fires onClose on a mousedown outside the panel', () => {
    let closed = 0;
    render(DraggablePanel, {
      props: {
        left: 0,
        top: 0,
        clickOutsideDismiss: true,
        onClose: () => {
          closed++;
        },
        children: textSnippet('<span>x</span>'),
      },
    });
    // Click on document body (outside the panel).
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(closed).toBe(1);
  });

  it('clickOutsideDismiss=true does NOT fire onClose when the click target is an INPUT', () => {
    let closed = 0;
    render(DraggablePanel, {
      props: {
        left: 0,
        top: 0,
        clickOutsideDismiss: true,
        onClose: () => {
          closed++;
        },
        children: textSnippet('<span>x</span>'),
      },
    });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(closed).toBe(0);
    input.remove();
  });

  it('clickOutsideDismiss=true does NOT fire onClose when the click target is a TEXTAREA', () => {
    let closed = 0;
    render(DraggablePanel, {
      props: {
        left: 0,
        top: 0,
        clickOutsideDismiss: true,
        onClose: () => {
          closed++;
        },
        children: textSnippet('<span>x</span>'),
      },
    });
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(closed).toBe(0);
    ta.remove();
  });

  it('clickOutsideDismiss=false suppresses click-outside dismissal', () => {
    let closed = 0;
    render(DraggablePanel, {
      props: {
        left: 0,
        top: 0,
        clickOutsideDismiss: false,
        onClose: () => {
          closed++;
        },
        children: textSnippet('<span>x</span>'),
      },
    });
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(closed).toBe(0);
  });

  it('extra style string is appended after the position declaration', () => {
    const { container } = render(DraggablePanel, {
      props: {
        left: 5,
        top: 7,
        style: 'z-index: 99;',
        onClose: () => {},
        children: textSnippet('<span>x</span>'),
      },
    });
    const root = container.querySelector('.ega-draggable-panel') as HTMLElement;
    const style = root.getAttribute('style') ?? '';
    expect(style).toContain('left: 5px');
    expect(style).toContain('top: 7px');
    expect(style).toContain('z-index: 99');
  });

  // Only the left-border gutter drags; a whole-panel drag fired on ordinary clicks.
  describe('left-border drag gutter', () => {
    it('renders the gutter when draggable=true', () => {
      const { container } = render(DraggablePanel, {
        props: {
          left: 0,
          top: 0,
          draggable: true,
          onClose: () => {},
          children: textSnippet('<span>x</span>'),
        },
      });
      const gutter = container.querySelector('.ega-drag-gutter');
      expect(gutter).not.toBeNull();
    });

    it('does NOT render the gutter when draggable=false', () => {
      const { container } = render(DraggablePanel, {
        props: {
          left: 0,
          top: 0,
          draggable: false,
          onClose: () => {},
          children: textSnippet('<span>x</span>'),
        },
      });
      expect(container.querySelector('.ega-drag-gutter')).toBeNull();
    });

    it('gutter carries an aria-label so screen readers announce the affordance', () => {
      const { container } = render(DraggablePanel, {
        props: {
          left: 0,
          top: 0,
          draggable: true,
          onClose: () => {},
          children: textSnippet('<span>x</span>'),
        },
      });
      const gutter = container.querySelector('.ega-drag-gutter') as HTMLElement;
      expect(gutter.getAttribute('aria-label')).toBeTruthy();
    });

    it('pointerdown on the gutter flips the panel into the dragging state (is-dragging class)', async () => {
      const { container } = render(DraggablePanel, {
        props: {
          left: 0,
          top: 0,
          draggable: true,
          onClose: () => {},
          children: textSnippet('<span>x</span>'),
        },
      });
      const root = container.querySelector('.ega-draggable-panel') as HTMLElement;
      const gutter = container.querySelector('.ega-drag-gutter') as HTMLElement;
      expect(root.classList.contains('is-dragging')).toBe(false);
      // setPointerCapture isn't implemented in jsdom — stub before dispatch.
      (gutter as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture =
        () => {};
      await fireEvent.pointerDown(gutter, { clientX: 5, clientY: 5, pointerId: 1 });
      expect(root.classList.contains('is-dragging')).toBe(true);
    });

    it('pointerdown on the panel body (NOT the gutter) does NOT start a drag', async () => {
      const { container } = render(DraggablePanel, {
        props: {
          left: 0,
          top: 0,
          draggable: true,
          onClose: () => {},
          children: textSnippet('<span data-ega-test-body>body</span>'),
        },
      });
      const root = container.querySelector('.ega-draggable-panel') as HTMLElement;
      const body = container.querySelector('[data-ega-test-body]') as HTMLElement;
      await fireEvent.pointerDown(body, { clientX: 5, clientY: 5, pointerId: 1 });
      expect(root.classList.contains('is-dragging')).toBe(false);
    });

    it('Escape during a drag cancels the drag and snaps back to the starting offset (does NOT call onClose)', async () => {
      let closed = 0;
      const { container } = render(DraggablePanel, {
        props: {
          left: 100,
          top: 100,
          draggable: true,
          onClose: () => {
            closed++;
          },
          children: textSnippet('<span>x</span>'),
        },
      });
      const root = container.querySelector('.ega-draggable-panel') as HTMLElement;
      const gutter = container.querySelector('.ega-drag-gutter') as HTMLElement;
      (gutter as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture =
        () => {};
      (gutter as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture =
        () => {};
      // Start drag at (0,0).
      await fireEvent.pointerDown(gutter, { clientX: 0, clientY: 0, pointerId: 1 });
      // Drag to (40,40) — the panel should reposition by that delta.
      await fireEvent.pointerMove(gutter, { clientX: 40, clientY: 40, pointerId: 1 });
      expect(root.style.left).toBe('140px');
      expect(root.style.top).toBe('140px');
      // Esc mid-drag — must cancel + snap back, NOT close.
      await fireEvent.keyDown(root, { key: 'Escape' });
      expect(closed).toBe(0);
      expect(root.classList.contains('is-dragging')).toBe(false);
      expect(root.style.left).toBe('100px');
      expect(root.style.top).toBe('100px');
    });

    it('Escape outside an active drag still fires onClose', async () => {
      let closed = 0;
      const { container } = render(DraggablePanel, {
        props: {
          left: 0,
          top: 0,
          draggable: true,
          onClose: () => {
            closed++;
          },
          children: textSnippet('<span>x</span>'),
        },
      });
      const root = container.querySelector('.ega-draggable-panel') as HTMLElement;
      await fireEvent.keyDown(root, { key: 'Escape' });
      expect(closed).toBe(1);
    });
  });
});
