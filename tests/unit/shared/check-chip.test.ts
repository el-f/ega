import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// One rule pads every chip that draws a check only when picked; each chip passes its icon size and base padding (R63).
describe('.ega-check-chip', () => {
  it('splits the check room into both paddings while unpicked, in tokens.css', () => {
    const tokens = readFileSync('src/shared/tokens.css', 'utf8');
    expect(tokens).toMatch(
      /\.ega-check-chip:not\(\[aria-pressed='true'\], \[aria-checked='true'\], \.active\) \{\s*padding-inline: calc\(var\(--chip-pad\) \+ \(var\(--chip-check\) \+ var\(--space-1\)\) \/ 2\);/,
    );
  });

  it.each([
    'src/options/components/rules/RuleScopeToggles.svelte',
    'src/shared/components/TaskPicker.svelte',
    'src/shared/components/ContextLevelPicker.svelte',
  ])('%s uses it, with no copy of the formula or a typed icon size', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).toContain('ega-check-chip');
    expect(src).toMatch(/style:--chip-check="\{CHECK\}px"/);
    expect(src).not.toMatch(/var\(--space-1\)\) \/ 2|<Check size=\{\d+\}/);
    expect(src).not.toMatch(/padding(-inline)?: [^;]*var\(--space-\d\)[^;]*;\s*$/m);
  });
});
