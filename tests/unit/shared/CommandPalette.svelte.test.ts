// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CommandPalette from '@/shared/components/CommandPalette.svelte';
import type { Command } from '@/shared/command-registry';

// Bits UI selects the first option a few microtasks after mount; let that land before a key press.
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function cmd(
  id: string,
  label: string,
  group: Command['group'] = 'actions',
  run: () => void = () => {},
): Command {
  return { id, label, group, run };
}

describe('CommandPalette', () => {
  it('renders input + empty state when commands is empty and open', () => {
    const { getByRole, getByText } = render(CommandPalette, {
      props: { open: true, commands: [], onClose: () => {} },
    });
    expect(getByRole('combobox')).toBeTruthy();
    expect(getByText('No matches.')).toBeTruthy();
  });

  it('does not render when open=false', () => {
    const { queryByRole } = render(CommandPalette, {
      props: {
        open: false,
        commands: [cmd('a', 'Alpha')],
        onClose: () => {},
      },
    });
    expect(queryByRole('combobox')).toBeNull();
  });

  it('renders grouped sections when commands span groups', () => {
    const commands: Command[] = [
      cmd('a1', 'Open Options', 'actions'),
      cmd('s1', 'Toggle theme', 'settings'),
    ];
    const { getByText } = render(CommandPalette, {
      props: { open: true, commands, onClose: () => {} },
    });
    expect(getByText('Actions')).toBeTruthy();
    expect(getByText('Settings')).toBeTruthy();
  });

  it('ArrowDown moves aria-selected to next item', async () => {
    const commands: Command[] = [cmd('a1', 'Alpha'), cmd('a2', 'Beta'), cmd('a3', 'Gamma')];
    const { container, getByRole } = render(CommandPalette, {
      props: { open: true, commands, onClose: () => {} },
    });
    const combobox = getByRole('combobox');
    const options = () =>
      Array.from(container.querySelectorAll('[role="option"]')) as HTMLElement[];
    await settle();
    // Initial: first option selected.
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true');
    await fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(options()[1]?.getAttribute('aria-selected')).toBe('true');
    await fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(options()[2]?.getAttribute('aria-selected')).toBe('true');
    // Wraps.
    await fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('ArrowUp from first wraps to last', async () => {
    const commands: Command[] = [cmd('a1', 'Alpha'), cmd('a2', 'Beta')];
    const { container, getByRole } = render(CommandPalette, {
      props: { open: true, commands, onClose: () => {} },
    });
    const combobox = getByRole('combobox');
    await settle();
    const opts = Array.from(container.querySelectorAll('[role="option"]')) as HTMLElement[];
    expect(opts[0]?.getAttribute('aria-selected')).toBe('true');
    await fireEvent.keyDown(combobox, { key: 'ArrowUp' });
    expect(opts[1]?.getAttribute('aria-selected')).toBe('true');
  });

  it('Enter fires the selected command run + onClose', async () => {
    const onClose = vi.fn();
    const run = vi.fn();
    const commands: Command[] = [cmd('a1', 'Alpha', 'actions', run)];
    const { getByRole } = render(CommandPalette, {
      props: { open: true, commands, onClose },
    });
    await settle();
    await fireEvent.keyDown(getByRole('combobox'), { key: 'Enter' });
    expect(run).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('typing filters the list via the real fuzzy matcher', async () => {
    const commands: Command[] = [
      cmd('a1', 'Open Options'),
      cmd('a2', 'Switch theme: dark'),
      cmd('a3', 'Selection bubble: smart'),
    ];
    const { container, queryByText } = render(CommandPalette, {
      props: { open: true, commands, onClose: () => {} },
    });
    const input = container.querySelector('input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'open' } });
    expect(queryByText('Open Options')).toBeTruthy();
    expect(queryByText('Switch theme: dark')).toBeNull();
  });

  it('click on an option fires its run + onClose', async () => {
    const onClose = vi.fn();
    const run = vi.fn();
    const commands: Command[] = [cmd('a1', 'Alpha', 'actions', run)];
    const { getByText } = render(CommandPalette, {
      props: { open: true, commands, onClose },
    });
    await fireEvent.click(getByText('Alpha'));
    expect(run).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  // `?` cannot fire from here: focus sits in a text field, and every surface guards that key.
  it('footer points at the shortcuts command, not at a key it cannot answer', () => {
    const { container } = render(CommandPalette, {
      props: { open: true, commands: [], onClose: () => {} },
    });
    const foot = container.querySelector('[data-ega-palette-xref]');
    expect(foot).not.toBeNull();
    expect(foot?.textContent ?? '').toMatch(/shortcuts/i);
    expect(foot?.textContent ?? '').not.toMatch(/press\s*\?/i);
  });
});

const baseCommands: readonly Command[] = [
  { id: 'a.1', group: 'actions', label: 'Translate', run: vi.fn() },
  { id: 'a.2', group: 'actions', label: 'Open Options', run: vi.fn() },
  {
    id: 's.1',
    group: 'settings',
    label: 'Toggle theme',
    hint: '→ dark',
    run: vi.fn(),
  },
];

describe('CommandPalette — combobox roles + grouping', () => {
  it('renders nothing when closed', () => {
    const { queryByRole } = render(CommandPalette, {
      props: { open: false, commands: baseCommands, onClose: vi.fn() },
    });
    expect(queryByRole('combobox')).toBeNull();
    expect(queryByRole('textbox')).toBeNull();
  });

  it('puts the combobox role on the input itself', () => {
    const { getByRole, container } = render(CommandPalette, {
      props: { open: true, commands: baseCommands, onClose: vi.fn() },
    });
    const combobox = getByRole('combobox', { name: 'Command palette' });
    expect(combobox.tagName).toBe('INPUT');
    expect(combobox.getAttribute('aria-controls')).toBe('ega-cmd-list');
    expect(container.querySelector('#ega-cmd-list')?.closest('[role="listbox"]')).not.toBeNull();
  });

  it('points aria-activedescendant at the selected option', async () => {
    const { getByRole, container } = render(CommandPalette, {
      props: { open: true, commands: baseCommands, onClose: vi.fn() },
    });
    const combobox = getByRole('combobox');
    const activeId = () => combobox.getAttribute('aria-activedescendant');
    await settle();
    expect(activeId()).toBe('ega-cmd-opt-a.1');
    expect(container.querySelector(`[id="${activeId()}"]`)).not.toBeNull();
    await fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(activeId()).toBe('ega-cmd-opt-a.2');
  });

  it('keeps DOM focus in the input — options are not tab stops', () => {
    const { container } = render(CommandPalette, {
      props: { open: true, commands: baseCommands, onClose: vi.fn() },
    });
    for (const opt of container.querySelectorAll<HTMLElement>('[role="option"]')) {
      expect(opt.tabIndex).toBe(-1);
    }
  });

  it('wraps each section in a named listbox group', () => {
    const { container, getAllByRole, getByRole } = render(CommandPalette, {
      props: { open: true, commands: baseCommands, onClose: vi.fn() },
    });
    const groups = getAllByRole('group');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toBe(getByRole('group', { name: 'Actions' }));
    expect(groups[1]).toBe(getByRole('group', { name: 'Settings' }));
    const headings = Array.from(container.querySelectorAll('.ega-palette-section-heading'));
    expect(headings).toHaveLength(2);
    for (const heading of headings) expect(heading.getAttribute('aria-hidden')).toBe('true');
  });

  it('groups results by category', () => {
    const { getByText } = render(CommandPalette, {
      props: { open: true, commands: baseCommands, onClose: vi.fn() },
    });
    expect(getByText('Actions')).toBeTruthy();
    expect(getByText('Settings')).toBeTruthy();
  });

  it('filters by fuzzy query', async () => {
    const { getByRole, queryByText } = render(CommandPalette, {
      props: { open: true, commands: baseCommands, onClose: vi.fn() },
    });
    const input = getByRole('combobox') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'trans' } });
    expect(queryByText('Translate')).toBeTruthy();
    expect(queryByText('Toggle theme')).toBeNull();
  });

  it('Enter runs the top result and closes', async () => {
    const onClose = vi.fn();
    const runSpy = vi.fn();
    const cmds: readonly Command[] = [{ id: 'x', group: 'actions', label: 'Xray', run: runSpy }];
    const { getByRole } = render(CommandPalette, {
      props: { open: true, commands: cmds, onClose },
    });
    await settle();
    await fireEvent.keyDown(getByRole('combobox'), { key: 'Enter' });
    expect(runSpy).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('ArrowDown moves selection to the next item', async () => {
    const { getByRole, container } = render(CommandPalette, {
      props: { open: true, commands: baseCommands, onClose: vi.fn() },
    });
    await settle();
    await fireEvent.keyDown(getByRole('combobox'), { key: 'ArrowDown' });
    const selected = container.querySelector('[role="option"][aria-selected="true"]');
    expect(selected).not.toBeNull();
    // second item should be selected after one ArrowDown
    expect(selected?.textContent).toMatch(/Open Options/i);
  });

  it('renders "No matches" when query filters everything out', async () => {
    const { getByRole, getByText } = render(CommandPalette, {
      props: { open: true, commands: baseCommands, onClose: vi.fn() },
    });
    await fireEvent.input(getByRole('combobox'), {
      target: { value: 'zzzxxxyyy' },
    });
    expect(getByText(/No matches/i)).toBeTruthy();
  });

  it('clicking a palette item runs the command and closes', async () => {
    const onClose = vi.fn();
    const runSpy = vi.fn();
    const cmds: readonly Command[] = [
      { id: 'c.1', group: 'actions', label: 'Clickme', run: runSpy },
    ];
    const { getByText } = render(CommandPalette, {
      props: { open: true, commands: cmds, onClose },
    });
    await fireEvent.click(getByText('Clickme'));
    expect(runSpy).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('puts the selection back on the first result when the query changes', async () => {
    const { getByRole, getAllByRole } = render(CommandPalette, {
      props: { open: true, commands: baseCommands, onClose: vi.fn() },
    });
    const combobox = getByRole('combobox');
    await settle();
    await fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    await fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(combobox.getAttribute('aria-activedescendant')).toBe('ega-cmd-opt-s.1');
    // `t` keeps Toggle theme listed, so only a reset moves the selection off it.
    await fireEvent.input(combobox, { target: { value: 't' } });
    await settle();
    const options = getAllByRole('option');
    expect(options.map((o) => o.id)).toContain('ega-cmd-opt-s.1');
    expect(options[0]?.id).not.toBe('ega-cmd-opt-s.1');
    expect(combobox.getAttribute('aria-activedescendant')).toBe(options[0]?.id);
  });

  it('puts the selection back on the first result when the palette reopens', async () => {
    const { getByRole, rerender } = render(CommandPalette, {
      props: { open: true, commands: baseCommands, onClose: vi.fn() },
    });
    await settle();
    await fireEvent.keyDown(getByRole('combobox'), { key: 'ArrowDown' });
    expect(getByRole('combobox').getAttribute('aria-activedescendant')).toBe('ega-cmd-opt-a.2');
    await rerender({ open: false });
    await rerender({ open: true });
    await settle();
    expect(getByRole('combobox').getAttribute('aria-activedescendant')).toBe('ega-cmd-opt-a.1');
  });

  // The query is an editable text field: its caret keys must not move the list selection.
  it.each([
    { key: 'Home' },
    { key: 'End' },
    { key: 'Home', shiftKey: true },
    { key: 'End', shiftKey: true },
    { key: 'ArrowUp', metaKey: true },
    { key: 'ArrowDown', metaKey: true },
  ])('leaves %o to the text field', async (init) => {
    const { getByRole } = render(CommandPalette, {
      props: { open: true, commands: baseCommands, onClose: vi.fn() },
    });
    const combobox = getByRole('combobox');
    await settle();
    await fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(combobox.getAttribute('aria-activedescendant')).toBe('ega-cmd-opt-a.2');
    const notPrevented = await fireEvent.keyDown(combobox, init);
    expect(notPrevented).toBe(true);
    expect(combobox.getAttribute('aria-activedescendant')).toBe('ega-cmd-opt-a.2');
  });

  // Ctrl+K opens the palette on both surfaces, so the list must ignore the vim bindings.
  it.each(['k', 'p', 'j', 'n'])('ignores Ctrl+%s inside the open palette', async (key) => {
    const { getByRole } = render(CommandPalette, {
      props: { open: true, commands: baseCommands, onClose: vi.fn() },
    });
    const combobox = getByRole('combobox');
    await settle();
    const notPrevented = await fireEvent.keyDown(combobox, { key, ctrlKey: true });
    expect(notPrevented).toBe(true);
    expect(combobox.getAttribute('aria-activedescendant')).toBe('ega-cmd-opt-a.1');
  });

  it('selects the option under the pointer', async () => {
    const { getByRole, getByText } = render(CommandPalette, {
      props: { open: true, commands: baseCommands, onClose: vi.fn() },
    });
    await settle();
    await fireEvent.pointerMove(getByText('Toggle theme'));
    expect(getByRole('combobox').getAttribute('aria-activedescendant')).toBe('ega-cmd-opt-s.1');
  });
});
