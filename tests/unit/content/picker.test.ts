// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const showToastSpy = vi.fn();
vi.mock('@/content/toast', () => ({
  showToast: (...a: unknown[]) => showToastSpy(...a),
  dismissToast: vi.fn(),
}));

import { createPicker } from '@/content/picker';
import { dismissToast } from '@/content/toast';
import { mountShadowHost } from '@/content/shadowHost';

function mockEnvironment() {
  document.body.innerHTML = `
    <article id="outer">
      <p id="para">hello world</p>
      <a href="#" id="link">click me</a>
      <input id="pw" type="password" />
    </article>
  `;
}

describe('picker state machine', () => {
  beforeEach(() => {
    // An empty pick mounts the shadow host for its toast; clear it so the next test starts clean.
    dismissToast();
    showToastSpy.mockClear();
    document.querySelectorAll('#ega-shadow-host').forEach((n) => n.remove());
    document.body.innerHTML = '';
  });

  it('marks the page root while picking, so the page sheet shows a crosshair', () => {
    const p = createPicker({ onPick: vi.fn(), onExit: vi.fn() });
    p.enter();
    expect(document.documentElement.hasAttribute('data-ega-picking')).toBe(true);
    expect(document.getElementById('ega-page-styles')).not.toBeNull();
    p.exit();
    expect(document.documentElement.hasAttribute('data-ega-picking')).toBe(false);
  });

  it('starts inactive', () => {
    const p = createPicker({ onPick: vi.fn(), onExit: vi.fn() });
    expect(p.isActive()).toBe(false);
  });

  it('enter() activates and installs listeners; exit() deactivates', () => {
    const p = createPicker({ onPick: vi.fn(), onExit: vi.fn() });
    p.enter();
    expect(p.isActive()).toBe(true);
    p.exit();
    expect(p.isActive()).toBe(false);
  });

  it('enter() is idempotent — second call is a no-op', () => {
    const p = createPicker({ onPick: vi.fn(), onExit: vi.fn() });
    p.enter();
    p.enter();
    expect(p.isActive()).toBe(true);
    p.exit();
  });

  it('Escape key exits and calls onExit', () => {
    const onExit = vi.fn();
    const p = createPicker({ onPick: vi.fn(), onExit });
    p.enter();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(p.isActive()).toBe(false);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('click captures innerText of the target element and calls onPick', () => {
    mockEnvironment();
    const onPick = vi.fn();
    const p = createPicker({ onPick, onExit: vi.fn() });
    p.enter();
    const para = document.getElementById('para');
    if (!para) throw new Error('test setup: #para');
    para.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'hello world', element: para }),
    );
    expect(p.isActive()).toBe(false);
  });

  it('click on a sensitive (password) input picks nothing and adds no toast: the bar already says why', () => {
    mockEnvironment();
    const onPick = vi.fn();
    const p = createPicker({ onPick, onExit: vi.fn() });
    p.enter();
    const pw = document.getElementById('pw');
    if (!pw) throw new Error('test setup: #pw');
    pw.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onPick).not.toHaveBeenCalled();
    expect(showToastSpy).not.toHaveBeenCalled();
    // Still active — the click was discarded, not a successful pick.
    expect(p.isActive()).toBe(true);
    p.exit();
  });

  it('click on an empty (no innerText) element exits picker without calling onPick', () => {
    document.body.innerHTML = '<div id="empty" style="width:10px;height:10px"></div>';
    const onPick = vi.fn();
    const onExit = vi.fn();
    const p = createPicker({ onPick, onExit });
    p.enter();
    const empty = document.getElementById('empty');
    if (!empty) throw new Error('test setup: #empty');
    empty.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onPick).not.toHaveBeenCalled();
    expect(p.isActive()).toBe(false);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('mousemove over a sensitive (password) input marks it as refused, not pickable', () => {
    mockEnvironment();
    const onHover = vi.fn();
    const p = createPicker({ onPick: vi.fn(), onExit: vi.fn(), onHover });
    p.enter();
    const pw = document.getElementById('pw');
    if (!pw) throw new Error('test setup: #pw');
    pw.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(onHover).toHaveBeenCalledWith({ element: pw, blocked: true });
    p.exit();
  });

  it('hover pickable → sensitive leaves no stale outline and Enter picks nothing', () => {
    mockEnvironment();
    const onHover = vi.fn();
    const onPick = vi.fn();
    const p = createPicker({ onPick, onExit: vi.fn(), onHover });
    p.enter();
    const para = document.getElementById('para');
    const pw = document.getElementById('pw');
    if (!para || !pw) throw new Error('test setup');
    para.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    pw.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(onHover.mock.calls.at(-1)?.[0]).toEqual({ element: pw, blocked: true });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onPick).not.toHaveBeenCalled();
    p.exit();
  });

  it('click inside the ega shadow host is ignored (does not pick)', () => {
    mockEnvironment();
    const host = mountShadowHost();
    const onPick = vi.fn();
    const p = createPicker({ onPick, onExit: vi.fn() });
    p.enter();
    // Events from inside the open shadow root retarget to the host element.
    host.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onPick).not.toHaveBeenCalled();
    expect(p.isActive()).toBe(true);
    p.exit();
  });

  it('a page decoy carrying the ega host id is still pickable', () => {
    mockEnvironment();
    mountShadowHost();
    const decoy = document.createElement('div');
    decoy.id = 'ega-shadow-host';
    decoy.textContent = 'page content pretending to be ours';
    document.body.appendChild(decoy);
    const onPick = vi.fn();
    const p = createPicker({ onPick, onExit: vi.fn() });
    p.enter();
    decoy.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onPick).toHaveBeenCalled();
  });

  it('mousemove reports the hovered element and reads no layout', () => {
    mockEnvironment();
    const onHover = vi.fn();
    const p = createPicker({ onPick: vi.fn(), onExit: vi.fn(), onHover });
    p.enter();
    const para = document.getElementById('para');
    if (!para) throw new Error('test setup: #para');
    const measure = vi.spyOn(para, 'getBoundingClientRect');
    para.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    // The overlay reads the box in its paint frame; a read per mousemove forces a layout each time.
    expect(measure).not.toHaveBeenCalled();
    expect(onHover).toHaveBeenCalled();
    const lastCall = onHover.mock.calls.at(-1);
    if (!lastCall) throw new Error('expected onHover to be called');
    const arg = lastCall[0];
    expect(arg).toEqual({ element: para });
    p.exit();
  });

  it('outlines the block under the pointer at once, before any mouse move', () => {
    mockEnvironment();
    const para = document.getElementById('para') as HTMLElement;
    const real = document.querySelectorAll.bind(document);
    // jsdom keeps no hover state; the browser's is the chain from <html> down to the element under the pointer.
    const spy = vi
      .spyOn(document, 'querySelectorAll')
      .mockImplementation(((sel: string) =>
        sel === ':hover'
          ? [document.documentElement, document.body, para.parentElement, para]
          : real(sel)) as typeof document.querySelectorAll);
    const onHover = vi.fn();
    const p = createPicker({ onPick: vi.fn(), onExit: vi.fn(), onHover });
    try {
      p.enter();
      expect(onHover).toHaveBeenLastCalledWith({ element: para });
    } finally {
      p.exit();
      spy.mockRestore();
    }
  });

  it('with no pointer on the page, the first block in view gets the outline and Enter picks it', () => {
    mockEnvironment();
    const para = document.getElementById('para') as HTMLElement;
    para.getBoundingClientRect = () => ({ top: 40, height: 20 }) as DOMRect;
    const onHover = vi.fn();
    const onPick = vi.fn();
    const p = createPicker({ onPick, onExit: vi.fn(), onHover });
    p.enter();
    expect(onHover).toHaveBeenLastCalledWith({ element: para });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ element: para }));
  });

  it('exit() removes listeners (subsequent events do not fire callbacks)', () => {
    mockEnvironment();
    const onPick = vi.fn();
    const onHover = vi.fn();
    const p = createPicker({ onPick, onHover, onExit: vi.fn() });
    p.enter();
    p.exit();
    const para = document.getElementById('para');
    if (!para) throw new Error('test setup: #para');
    para.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    para.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onHover).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });
});
