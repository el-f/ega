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
    id: 'selection-bubble',
    label: 'Selection & picker',
    description: 'When the selection bubble appears, and the element picker.',
  },
  {
    id: 'backends',
    label: 'Backends',
    description:
      'Pick which backends Ega uses: a cloud API with your key, a local Ollama server, or the native host. The dot shows status: green = Ready, amber = Needs setup, red = Unavailable. For an API-key backend, green means a key is saved; press Test now to check that it works.',
  },
  {
    id: 'languages',
    label: 'Languages',
    description:
      'Built-in and custom languages. Set detection rules and translation examples for each.',
  },
  {
    id: 'templates',
    label: 'Templates',
    description:
      'Global prompt, per-task overrides, rules, recipes, snippets, per-language overrides.',
  },
  {
    id: 'glossary',
    label: 'Glossary',
    description:
      'Term → translation pairs Ega adds to Translate and Explain when the term appears in the text.',
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
