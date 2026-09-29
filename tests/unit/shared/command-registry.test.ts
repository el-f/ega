import { describe, it, expect, vi } from 'vitest';
import { buildRegistry, OPTIONS_TABS, type RegistryDeps } from '@/shared/command-registry';
import { ALL_TASKS } from '@/shared/task-prompts';

function baseDeps(overrides: Partial<RegistryDeps> = {}): RegistryDeps {
  return {
    onOpenOptions: vi.fn(),
    onSwapTheme: vi.fn(),
    onSetBubbleMode: vi.fn(),
    currentTheme: 'system',
    ...overrides,
  };
}

describe('buildRegistry', () => {
  it('produces actions', () => {
    const cmds = buildRegistry(baseDeps());
    expect(cmds.length).toBeGreaterThan(0);
    expect(cmds.every((c) => c.group === 'actions')).toBe(true);
  });

  it('excludes the currently-active theme from the switch list', () => {
    const dark = buildRegistry(baseDeps({ currentTheme: 'dark' }));
    const themes = dark.filter((c) => c.id.startsWith('theme.')).map((c) => c.id);
    expect(themes).toContain('theme.system');
    expect(themes).toContain('theme.light');
    expect(themes).not.toContain('theme.dark');

    const light = buildRegistry(baseDeps({ currentTheme: 'light' }));
    const lightThemes = light.filter((c) => c.id.startsWith('theme.')).map((c) => c.id);
    expect(lightThemes).not.toContain('theme.light');
  });

  it('covers all Options tabs with an options.open.<tab> entry', () => {
    const cmds = buildRegistry(baseDeps());
    for (const tab of OPTIONS_TABS) {
      expect(cmds.some((c) => c.id === `options.open.${tab}`)).toBe(true);
    }
    // Every options tab is reachable, glossary included.
    expect(OPTIONS_TABS.length).toBe(8);
    expect(cmds.some((c) => c.id === 'options.open.glossary')).toBe(true);
  });

  it('labels show human names, never raw ids', () => {
    const cmds = buildRegistry(baseDeps({ onSetTask: vi.fn() }));
    const byId = new Map(cmds.map((c) => [c.id, c.label]));
    expect(byId.get('options.open.selection-bubble')).toBe('Open Settings: Selection & picker');
    expect(byId.get('task.translate')).toBe('Switch task: Translate');
    expect(byId.get('task.reword')).toBe('Switch task: Reword');
    expect(byId.get('bubble.smart')).toBe('Selection bubble: Smart');
    for (const c of cmds) {
      expect(c.label, `label for ${c.id} leaks a raw id`).not.toMatch(/selection-bubble/);
    }
  });

  it('has unique command IDs across all groups', () => {
    const cmds = buildRegistry(
      baseDeps({
        onOpenSidePanel: vi.fn(),
      }),
    );
    const ids = cmds.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('omits sidepanel.open when onOpenSidePanel is absent', () => {
    const cmds = buildRegistry(baseDeps());
    expect(cmds.find((c) => c.id === 'sidepanel.open')).toBeUndefined();
  });

  it('includes sidepanel.open when the dep is provided', () => {
    const open = vi.fn();
    const cmds = buildRegistry(baseDeps({ onOpenSidePanel: open }));
    const cmd = cmds.find((c) => c.id === 'sidepanel.open');
    expect(cmd).toBeDefined();
    void cmd?.run();
    expect(open).toHaveBeenCalledOnce();
  });

  it('omits help.shortcuts when the surface has no shortcuts panel', () => {
    const cmds = buildRegistry(baseDeps());
    expect(cmds.find((c) => c.id === 'help.shortcuts')).toBeUndefined();
  });

  it('offers the shortcuts panel as a command — the palette cannot answer the ? key', () => {
    const onShowShortcuts = vi.fn();
    const cmds = buildRegistry(baseDeps({ onShowShortcuts }));
    const cmd = cmds.find((c) => c.id === 'help.shortcuts');
    expect(cmd?.label).toBe('Keyboard shortcuts');
    void cmd?.run();
    expect(onShowShortcuts).toHaveBeenCalledOnce();
  });

  it('run() forwards to the right dep — theme switch', () => {
    const onSwapTheme = vi.fn();
    const cmds = buildRegistry(baseDeps({ onSwapTheme }));
    const light = cmds.find((c) => c.id === 'theme.light');
    expect(light).toBeDefined();
    void light?.run();
    expect(onSwapTheme).toHaveBeenCalledWith('light');
  });

  it('run() forwards to the right dep — options tab deep-link', () => {
    const onOpenOptions = vi.fn();
    const cmds = buildRegistry(baseDeps({ onOpenOptions }));
    const adv = cmds.find((c) => c.id === 'options.open.advanced');
    expect(adv).toBeDefined();
    void adv?.run();
    expect(onOpenOptions).toHaveBeenCalledWith('advanced');
  });

  it('run() forwards bubble mode', () => {
    const onSetBubbleMode = vi.fn();
    const cmds = buildRegistry(baseDeps({ onSetBubbleMode }));
    const smart = cmds.find((c) => c.id === 'bubble.smart');
    expect(smart).toBeDefined();
    void smart?.run();
    expect(onSetBubbleMode).toHaveBeenCalledWith('smart');
  });

  it('omits task.* entries when onSetTask is absent', () => {
    const cmds = buildRegistry(baseDeps());
    expect(cmds.find((c) => c.id.startsWith('task.'))).toBeUndefined();
  });

  it('includes one task.* entry per task in ALL_TASKS', () => {
    const onSetTask = vi.fn();
    const cmds = buildRegistry(baseDeps({ onSetTask }));
    const ids = cmds.filter((c) => c.id.startsWith('task.')).map((c) => c.id);
    expect(ids).toEqual(ALL_TASKS.map((t) => `task.${t}`));
    expect(ids).toContain('task.suggest-replies');
    expect(ids).toContain('task.ask');
  });

  it('task entries fire onSetTask when run', () => {
    const onSetTask = vi.fn();
    const cmds = buildRegistry(baseDeps({ onSetTask }));
    const translate = cmds.find((c) => c.id === 'task.translate');
    expect(translate).toBeDefined();
    void translate?.run();
    expect(onSetTask).toHaveBeenCalledWith('translate');
  });

  it('omits theme.cycle when onCycleTheme is absent', () => {
    const cmds = buildRegistry(baseDeps());
    expect(cmds.find((c) => c.id === 'theme.cycle')).toBeUndefined();
  });

  it('includes theme.cycle when onCycleTheme is provided + forwards on run', () => {
    const onCycleTheme = vi.fn();
    const cmds = buildRegistry(baseDeps({ onCycleTheme }));
    const cmd = cmds.find((c) => c.id === 'theme.cycle');
    expect(cmd).toBeDefined();
    void cmd?.run();
    expect(onCycleTheme).toHaveBeenCalledOnce();
  });

  it('IDs do not depend on timestamps — two consecutive calls produce the same IDs', () => {
    const d = baseDeps();
    const a = buildRegistry(d).map((c) => c.id);
    const b = buildRegistry(d).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it('omits rules.add when onAddRule is absent', () => {
    const cmds = buildRegistry(baseDeps());
    expect(cmds.find((c) => c.id === 'rules.add')).toBeUndefined();
  });

  it('includes rules.add when onAddRule is provided + forwards on run', () => {
    const onAddRule = vi.fn();
    const cmds = buildRegistry(baseDeps({ onAddRule }));
    const cmd = cmds.find((c) => c.id === 'rules.add');
    expect(cmd).toBeDefined();
    void cmd?.run();
    expect(onAddRule).toHaveBeenCalledOnce();
  });

  it('omits every conversation.* entry when panelActions is absent', () => {
    const cmds = buildRegistry(baseDeps());
    expect(cmds.find((c) => c.id.startsWith('conversation.'))).toBeUndefined();
  });

  it('pushes one entry per supplied panel action and forwards on run', () => {
    const newConversation = vi.fn();
    const cancelAll = vi.fn();
    const cmds = buildRegistry(
      baseDeps({
        panelActions: {
          'conversation.new': newConversation,
          'conversation.search': vi.fn(),
          'conversation.export.markdown': vi.fn(),
          'conversation.export.json': vi.fn(),
          'conversation.bookmarks': vi.fn(),
          'conversation.cancel-all': cancelAll,
        },
      }),
    );
    expect(cmds.filter((c) => c.id.startsWith('conversation.')).map((c) => c.id)).toEqual([
      'conversation.new',
      'conversation.search',
      'conversation.export.markdown',
      'conversation.export.json',
      'conversation.bookmarks',
      'conversation.cancel-all',
    ]);
    void cmds.find((c) => c.id === 'conversation.new')?.run();
    expect(newConversation).toHaveBeenCalledOnce();
    void cmds.find((c) => c.id === 'conversation.cancel-all')?.run();
    expect(cancelAll).toHaveBeenCalledOnce();
  });

  it('drops the panel actions the surface withholds', () => {
    const cmds = buildRegistry(baseDeps({ panelActions: { 'conversation.search': vi.fn() } }));
    expect(cmds.map((c) => c.id)).toContain('conversation.search');
    expect(cmds.find((c) => c.id === 'conversation.export.json')).toBeUndefined();
    expect(cmds.find((c) => c.id === 'conversation.cancel-all')).toBeUndefined();
  });
});
