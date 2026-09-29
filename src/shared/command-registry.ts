import { SETTINGS_TABS, TAB_LABELS, type SettingsTab } from './settings-tabs';
import type { Task } from './task-prompts';
import { ALL_TASKS, TASK_LABELS } from './task-prompts';

export type CommandGroup = 'actions' | 'settings';

export interface Command {
  /** Must be stable across renders — it is the `{#each}` key. Never include a timestamp. */
  readonly id: string;
  readonly group: CommandGroup;
  readonly label: string;
  /** Extra text fed to the fuzzy matcher alongside the label. */
  readonly keywords?: readonly string[];
  /** Muted secondary line under the label (e.g. translated preview). */
  readonly hint?: string;
  readonly run: () => void | Promise<void>;
}

export interface RegistryDeps {
  readonly onOpenOptions: (tab?: string) => void;
  readonly onSwapTheme: (to: 'system' | 'light' | 'dark') => void;
  readonly onSetBubbleMode: (m: 'always' | 'smart' | 'never') => void;
  readonly onSetTask?: (t: Task) => void;
  readonly onOpenSidePanel?: () => void;
  readonly onAddRule?: () => void;
  /** Opens the surface's shortcuts panel; `?` cannot fire while the palette holds focus. */
  readonly onShowShortcuts?: () => void;
  /** Cycle theme system → light → dark → system. */
  readonly onCycleTheme?: () => void;
  /** Header actions the surface offers right now; an omitted key stays out of the palette. */
  readonly panelActions?: Partial<Record<PanelAction, () => void>>;
  readonly currentTheme: 'system' | 'light' | 'dark';
}

/** Options tab ids. Palette deep-links route into each. */
export const OPTIONS_TABS: readonly SettingsTab[] = SETTINGS_TABS.map((t) => t.id);

/** The array is the declaration; `PanelAction` derives from it, so a new row cannot be half-wired. */
const PANEL_ACTIONS = [
  {
    id: 'conversation.new',
    label: 'New conversation',
    keywords: ['new', 'clear', 'reset', 'conversation'],
  },
  {
    id: 'conversation.search',
    label: 'Search conversation',
    keywords: ['search', 'find'],
  },
  {
    id: 'conversation.export.markdown',
    label: 'Copy conversation as Markdown',
    keywords: ['copy', 'export', 'markdown', 'clipboard'],
  },
  {
    id: 'conversation.export.json',
    label: 'Download conversation as JSON',
    keywords: ['download', 'export', 'json', 'save'],
  },
  {
    id: 'conversation.bookmarks',
    label: 'Show bookmarked only',
    keywords: ['bookmark', 'filter', 'starred'],
  },
  {
    id: 'conversation.cancel-all',
    label: 'Cancel all requests',
    keywords: ['cancel', 'stop', 'abort'],
  },
] as const;

export type PanelAction = (typeof PANEL_ACTIONS)[number]['id'];

export function buildRegistry(deps: RegistryDeps): Command[] {
  const cmds: Command[] = [];

  // --- Actions: task switch (surface decides what to do via onSetTask) ---
  if (deps.onSetTask) {
    const setTask = deps.onSetTask;
    for (const t of ALL_TASKS) {
      cmds.push({
        id: `task.${t}`,
        group: 'actions',
        label: `Switch task: ${TASK_LABELS[t]}`,
        keywords: ['task', t],
        run: () => void setTask(t),
      });
    }
  }

  // --- Actions: the surface's own header buttons ---
  const panel = deps.panelActions;
  if (panel) {
    for (const a of PANEL_ACTIONS) {
      const run = panel[a.id];
      if (!run) continue;
      cmds.push({ id: a.id, group: 'actions', label: a.label, keywords: a.keywords, run });
    }
  }

  // --- Actions: open Options (root + per-tab deep-link) ---
  cmds.push({
    id: 'options.open',
    group: 'actions',
    label: 'Open Settings',
    keywords: ['settings', 'preferences', 'options'],
    run: () => deps.onOpenOptions(),
  });
  for (const tab of OPTIONS_TABS) {
    cmds.push({
      id: `options.open.${tab}`,
      group: 'actions',
      label: `Open Settings: ${TAB_LABELS[tab]}`,
      keywords: ['options', 'settings', tab],
      run: () => deps.onOpenOptions(tab),
    });
  }

  // --- Actions: theme switch (skip current) ---
  const themes: ReadonlyArray<'system' | 'light' | 'dark'> = ['system', 'light', 'dark'];
  for (const t of themes) {
    if (t === deps.currentTheme) continue;
    cmds.push({
      id: `theme.${t}`,
      group: 'actions',
      label: `Switch theme: ${t}`,
      keywords: ['theme', 'dark mode', 'light mode'],
      run: () => deps.onSwapTheme(t),
    });
  }
  if (deps.onCycleTheme) {
    const cycle = deps.onCycleTheme;
    cmds.push({
      id: 'theme.cycle',
      group: 'actions',
      label: 'Cycle theme (system → light → dark)',
      keywords: ['theme', 'cycle', 'rotate'],
      run: () => cycle(),
    });
  }

  // --- Actions: bubble mode ---
  const bubbleModes = [
    ['always', 'Always'],
    ['smart', 'Smart'],
    ['never', 'Never'],
  ] as const;
  for (const [m, label] of bubbleModes) {
    cmds.push({
      id: `bubble.${m}`,
      group: 'actions',
      label: `Selection bubble: ${label}`,
      keywords: ['bubble', 'selection'],
      run: () => deps.onSetBubbleMode(m),
    });
  }

  // --- Actions: open side panel (only when the surface can) ---
  if (deps.onOpenSidePanel) {
    const open = deps.onOpenSidePanel;
    cmds.push({
      id: 'sidepanel.open',
      group: 'actions',
      label: 'Open side panel',
      keywords: ['panel', 'sidebar'],
      run: () => open(),
    });
  }

  // --- Actions: keyboard shortcuts panel ---
  if (deps.onShowShortcuts) {
    const show = deps.onShowShortcuts;
    cmds.push({
      id: 'help.shortcuts',
      group: 'actions',
      label: 'Keyboard shortcuts',
      keywords: ['keys', 'shortcuts', 'bindings', 'help'],
      run: () => show(),
    });
  }

  // --- Actions: add a rule (Options-only surface affordance) ---
  if (deps.onAddRule) {
    const addRule = deps.onAddRule;
    cmds.push({
      id: 'rules.add',
      group: 'actions',
      label: 'Add a rule',
      keywords: ['rule', 'rules', 'translate', 'instruction'],
      run: () => addRule(),
    });
  }

  return cmds;
}
