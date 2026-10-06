// Single source for options tab ids, labels and descriptions, so no two surfaces name a tab differently.

export interface SettingsTabSpec {
  readonly id: string;
  readonly label: string;
  /** Rendered by `TabHeader` at the top of the tab. */
  readonly description: string;
}

export const SETTINGS_TABS = [
  {
    id: 'translate',
    label: 'Answers',
    description: 'How answers look, what Ega sends, and how the model writes',
  },
  {
    id: 'tasks',
    label: 'Tasks',
    description: 'Which tasks show in the pickers, and what each one sends',
  },
  {
    id: 'selection-bubble',
    label: 'Selection and picker',
    description: 'The selection bubble, the element picker and the right-click menu',
  },
  {
    id: 'backends',
    label: 'Backends',
    description: 'Where Ega sends text, tried from the top of the list',
  },
  {
    id: 'languages',
    label: 'Languages',
    description: 'Default languages, and the slang and special languages Ega knows',
  },
  {
    id: 'glossary',
    label: 'Glossary and rules',
    description: 'Words and instructions Ega adds to every prompt',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Backups, saved data and diagnostics',
  },
  {
    id: 'about',
    label: 'About',
    description: 'Privacy and credits',
  },
] as const satisfies readonly SettingsTabSpec[];

export type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

export const TAB_LABELS: Record<SettingsTab, string> = Object.fromEntries(
  SETTINGS_TABS.map((t) => [t.id, t.label]),
) as Record<SettingsTab, string>;

export const TAB_DESCRIPTIONS: Record<SettingsTab, string> = Object.fromEntries(
  SETTINGS_TABS.map((t) => [t.id, t.description]),
) as Record<SettingsTab, string>;
