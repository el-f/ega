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

  it('click on a sensitive (password) input picks nothing but explains itself with a toast', () => {
    mockEnvironment();
    const onPick = vi.fn();
    const p = createPicker({ onPick, onExit: vi.fn() });
    p.enter();
    const pw = document.getElementById('pw');
    if (!pw) throw new Error('test setup: #pw');
    pw.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onPick).not.toHaveBeenCalled();
    expect(showToastSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /does not read password, card or other private fields, or text you can edit/i,
      ),
    );
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

  it('mousemove over a sensitive (password) input clears the hover highlight', () => {
    mockEnvironment();
    const onHover = vi.fn();
    const p = createPicker({ onPick: vi.fn(), onExit: vi.fn(), onHover });
    p.enter();
    const pw = document.getElementById('pw');
    if (!pw) throw new Error('test setup: #pw');
    pw.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(onHover).toHaveBeenCalledWith(null);
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
    expect(onHover.mock.calls.at(-1)?.[0]).toBeNull();
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

  it('mousemove reports hovered element + rect via onHover', () => {
    mockEnvironment();
    const onHover = vi.fn();
    const p = createPicker({ onPick: vi.fn(), onExit: vi.fn(), onHover });
    p.enter();
    const para = document.getElementById('para');
    if (!para) throw new Error('test setup: #para');
    para.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(onHover).toHaveBeenCalled();
    const lastCall = onHover.mock.calls.at(-1);
    if (!lastCall) throw new Error('expected onHover to be called');
    const arg = lastCall[0];
    expect(arg.element).toBe(para);
    expect(arg.rect).toBeDefined();
    p.exit();
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
