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
    label: 'Translate',
    description:
      'How translations behave: tooltip, streaming, page context, page translation and generation settings.',
  },
  {
    id: 'tasks',
    label: 'Tasks',
    description: 'Which tasks show in the pickers, and what each task sends.',
  },
  {
    id: 'selection-bubble',
    label: 'Selection & picker',
    description: 'When the selection bubble appears, and the element picker.',
  },
  {
    id: 'backends',
    label: 'Backends',
    description:
      'Pick which backends Ega uses: a cloud API with your key, a server on this computer (Ollama, LM Studio, llama-server), or the native host. Each card shows its status. An API-key backend says "Key saved" until you press Test now, and "Verified" after the test passes.',
  },
  {
    id: 'languages',
    label: 'Languages',
    description:
      'Built-in and custom languages. Set detection rules and translation examples for each.',
  },
  {
    id: 'glossary',
    label: 'Glossary',
    description:
      'Term → translation pairs Ega adds when the term appears in the text, for every task with Use glossary on.',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Diagnostics, data, labs. Changes apply immediately.',
  },
  {
    id: 'about',
    label: 'About',
    description: 'Privacy, data controls, and credits.',
  },
] as const satisfies readonly SettingsTabSpec[];

export type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

export const TAB_LABELS: Record<SettingsTab, string> = Object.fromEntries(
  SETTINGS_TABS.map((t) => [t.id, t.label]),
) as Record<SettingsTab, string>;

export const TAB_DESCRIPTIONS: Record<SettingsTab, string> = Object.fromEntries(
  SETTINGS_TABS.map((t) => [t.id, t.description]),
) as Record<SettingsTab, string>;
