export interface Feature {
  id: string;
  /** Human-readable label for headings / logs. */
  label: string;
  /** Rubric surfaces to compose. First wins for tie-breaks. */
  surfaces: string[];
  /** Filename prefixes that belong to this feature (matched against `<name>.png`). */
  shotPrefixes: string[];
  /** Source files / dirs to read inline. Relative to repo root. */
  codePaths: string[];
  /** Optional research topics the judge can choose to investigate via WebFetch. */
  researchTopics: string[];
}

export const FEATURES: Feature[] = [
  {
    id: 'tooltip',
    label: 'On-page tooltip',
    surfaces: ['tooltip'],
    shotPrefixes: ['tooltip-'],
    codePaths: ['src/content/Tooltip.svelte', 'src/content/tooltip'],
    researchTopics: [
      'in-page translation tooltip UX 2026',
      'shadow-DOM overlay positioning patterns',
      'inline AI explanation drawer patterns',
    ],
  },
  {
    id: 'smart-bubble',
    label: 'Smart bubble / selection action',
    surfaces: ['smart-bubble', 'tooltip'],
    shotPrefixes: ['smart-bubble-'],
    codePaths: [
      'src/content/Bubble.svelte',
      'src/content/bubble.ts',
      'src/content/should-show-bubble.ts',
    ],
    researchTopics: ['selection action bubble UX', 'one-click translate affordance'],
  },
  {
    id: 'sidepanel',
    label: 'Side panel conversation',
    surfaces: ['sidepanel'],
    shotPrefixes: ['sidepanel-'],
    codePaths: [
      'src/sidepanel/SidePanel.svelte',
      'src/sidepanel/conversation',
      'src/sidepanel/state',
    ],
    researchTopics: [
      'streaming assistant UI patterns',
      'multi-turn translation conversation UX',
      'in-extension chat empty state best practice',
    ],
  },
  {
    id: 'popup',
    label: 'Toolbar popup',
    surfaces: ['popup'],
    shotPrefixes: ['popup-', 'popup.'],
    codePaths: ['src/popup'],
    researchTopics: ['browser-extension popup UX 380x600', 'command palette inside popup'],
  },
  {
    id: 'options-templates',
    label: 'Options — templating + rules',
    surfaces: ['templates', 'options'],
    shotPrefixes: [
      'templates-',
      'rules-editor-',
      'profiles-',
      'per-preset-',
      'per-site-',
      'slot-palette-',
    ],
    codePaths: ['src/options/components/RulesEditor.svelte', 'src/options/components'],
    researchTopics: [
      'prompt template editor UX',
      'rule-based AI editing patterns',
      'CodeMirror template editor best practice',
    ],
  },
  {
    id: 'options-shell',
    label: 'Options shell + settings search',
    surfaces: ['options'],
    shotPrefixes: ['00-advanced-landing.', 'options-', 'subtab-', 'settings-search-'],
    codePaths: [
      'src/options/Options.svelte',
      'src/options/OptionsNav.svelte',
      'src/options/components/SettingsSearch.svelte',
      'src/options/tabs',
    ],
    researchTopics: ['settings hierarchy + search UX', 'Chrome extension options page IA patterns'],
  },
  {
    id: 'vision-picker',
    label: 'Page translate + picker + image OCR',
    surfaces: ['picker', 'page-translate', 'image-ocr'],
    shotPrefixes: ['picker-', 'page-translate-', 'image-translate-', 'inline-replace-'],
    codePaths: [
      'src/content/picker.ts',
      'src/content/page-translate-v2',
      'src/content/batch-progress.ts',
      'src/content/inlineReplace.ts',
      'src/background/imageTranslateDispatch.ts',
    ],
    researchTopics: [
      'element picker overlay UX',
      'batch translation progress UX',
      'image OCR translation overlay UX',
    ],
  },
];

export function findFeature(id: string): Feature | undefined {
  return FEATURES.find((f) => f.id === id);
}
