import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/** The declarations of the first rule whose selector line is exactly `selector`. */
function rule(file: string, selector: string): string {
  const src = readFileSync(file, 'utf8');
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^\\s*${escaped} \\{([^}]*)\\}`, 'm').exec(src);
  if (!m?.[1]) throw new Error(`no rule ${selector} in ${file}`);
  return m[1];
}

// --color-border is about 1.5:1 on the elevated surface; the edge is what shows these are text fields (WCAG 1.4.11).
describe('text-entry frames draw a 3:1 edge', () => {
  it.each([
    ['src/sidepanel/conversation/InputRow.svelte', '.ega-input-box'],
    ['src/popup/Popup.svelte', '.freeform-textarea'],
    ['src/shared/components/ConfirmDialog.svelte', '.confirm-input'],
    ['src/shared/components/CommandPalette.svelte', ':global(.ega-palette-input)'],
    ['src/shared/ui/Input.svelte', '.ega-input-row'],
    ['src/sidepanel/SidePanel.svelte', ".sp-search-bar input[type='search']"],
  ])('%s %s uses --color-control-border', (file, selector) => {
    expect(rule(file, selector)).toMatch(/border: 1px solid var\(--color-control-border\)/);
  });

  it('the popup site switch keeps the shared checkbox edge, 3:1 while off', () => {
    expect(rule('src/shared/ui/Checkbox.svelte', '.ega-checkbox-input')).toMatch(
      /border: 1px solid var\(--color-control-border\)/,
    );
    expect(
      rule('src/popup/PopupSite.svelte', ".switch-row :global(.ega-checkbox-input[role='switch'])"),
    ).not.toMatch(/border(-color)?:/);
  });
});

// A grey --color-bg-hover fill alone barely differs from the track; the shared Segmented's accent ring is the one look.
describe('segmented controls mark the selected segment like Segmented', () => {
  const effort = rule('src/shared/ui/Segmented.svelte', '.ega-segmented-item.active');

  it.each([
    ['src/shared/components/ContextLevelPicker.svelte', '.ctx-level-toggle button.active'],
    ['src/shared/components/ThemeToggle.svelte', '.theme-toggle button.active'],
    ['src/options/components/prompt/PromptEditor.svelte', '.pe-tab.active'],
  ])('%s', (file, selector) => {
    const active = rule(file, selector);
    for (const decl of ['background', 'box-shadow']) {
      const want = new RegExp(`${decl}:[^;]*;`).exec(effort)?.[0];
      expect(want).toBeDefined();
      expect(active).toContain(want);
    }
  });
});
