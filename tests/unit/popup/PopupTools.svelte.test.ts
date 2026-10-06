// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import PopupTools from '@/popup/PopupTools.svelte';

describe('PopupTools', () => {
  const base = {
    onTranslatePage: vi.fn(),
    onChooseAreas: vi.fn(),
    onPickElement: vi.fn(),
    onClipboard: vi.fn(),
    onOpenSidePanel: vi.fn(),
    pickerEnabled: true,
  };

  it('shows one primary and a list of four tools named by their visible label', () => {
    const { getByRole } = render(PopupTools, { props: base });
    expect(getByRole('button', { name: 'Translate page' })).toBeTruthy();
    const list = getByRole('toolbar', { name: 'Page tools' });
    expect(list.getAttribute('aria-orientation')).toBe('vertical');
    const names = [...list.querySelectorAll('button')].map((b) => b.textContent.trim());
    expect(names).toEqual([
      'Choose areas',
      'Pick element',
      'Translate clipboard',
      'Open side panel',
    ]);
  });

  it('runs each action from its own control', async () => {
    const props = {
      ...base,
      onTranslatePage: vi.fn(),
      onChooseAreas: vi.fn(),
      onOpenSidePanel: vi.fn(),
    };
    const { getByRole } = render(PopupTools, { props });
    await fireEvent.click(getByRole('button', { name: 'Translate page' }));
    await fireEvent.click(getByRole('button', { name: 'Choose areas' }));
    await fireEvent.click(getByRole('button', { name: 'Open side panel' }));
    expect(props.onTranslatePage).toHaveBeenCalledOnce();
    expect(props.onChooseAreas).toHaveBeenCalledOnce();
    expect(props.onOpenSidePanel).toHaveBeenCalledOnce();
  });

  it('keeps the list one tab stop and moves with the arrow keys, Home and End', async () => {
    const { getByRole } = render(PopupTools, { props: base });
    const list = getByRole('toolbar', { name: 'Page tools' });
    const rows = [...list.querySelectorAll<HTMLButtonElement>('button')];
    expect(rows.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    rows[0]?.focus();
    await fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
    await fireEvent.keyDown(list, { key: 'End' });
    expect(document.activeElement).toBe(rows[3]);
    await fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[0]);
    await fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[3]);
    await fireEvent.keyDown(list, { key: 'Home' });
    expect(document.activeElement).toBe(rows[0]);
    expect(rows.filter((r) => r.tabIndex === 0)).toEqual([rows[0]]);
  });

  it('keeps Pick element focusable when the picker is off, says why, and does nothing', async () => {
    const onPickElement = vi.fn();
    const { getByRole } = render(PopupTools, {
      props: { ...base, pickerEnabled: false, onPickElement },
    });
    const btn = getByRole('button', { name: /^Pick element/ });
    expect(btn.hasAttribute('disabled')).toBe(false);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.textContent).toContain('Off in Settings');
    const reason = document.getElementById(btn.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toMatch(/Turn it on in Settings → Selection & picker/);
    await fireEvent.click(btn);
    expect(onPickElement).not.toHaveBeenCalled();
  });

  it('blocks the page actions with the reason it is given, and leaves the side panel open', async () => {
    const reason = document.createElement('p');
    reason.id = 'why';
    reason.textContent = "Ega won't translate on this site.";
    document.body.append(reason);
    const props = {
      ...base,
      onTranslatePage: vi.fn(),
      onChooseAreas: vi.fn(),
      onPickElement: vi.fn(),
      onClipboard: vi.fn(),
      onOpenSidePanel: vi.fn(),
      pageBlockedBy: 'why',
    };
    const { getByRole } = render(PopupTools, { props });
    for (const name of ['Translate page', 'Choose areas', 'Pick element']) {
      const b = getByRole('button', { name });
      expect(b.getAttribute('aria-disabled')).toBe('true');
      expect(b.getAttribute('aria-describedby')).toBe('why');
      await fireEvent.click(b);
    }
    await fireEvent.click(getByRole('button', { name: 'Translate clipboard' }));
    await fireEvent.click(getByRole('button', { name: 'Open side panel' }));
    expect(props.onTranslatePage).not.toHaveBeenCalled();
    expect(props.onChooseAreas).not.toHaveBeenCalled();
    expect(props.onPickElement).not.toHaveBeenCalled();
    expect(props.onClipboard).toHaveBeenCalledOnce();
    expect(props.onOpenSidePanel).toHaveBeenCalledOnce();
    reason.remove();
  });

  it('a quiet primary still runs', async () => {
    const onTranslatePage = vi.fn();
    const { getByRole } = render(PopupTools, {
      props: { ...base, onTranslatePage, quietPrimary: true },
    });
    const primary = getByRole('button', { name: 'Translate page' });
    expect(primary.classList.contains('quiet')).toBe(true);
    await fireEvent.click(primary);
    expect(onTranslatePage).toHaveBeenCalledOnce();
  });
});
