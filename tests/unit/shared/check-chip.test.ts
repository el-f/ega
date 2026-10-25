import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// One rule holds the check's room on every chip that draws a check only when picked; each chip passes its icon size and base padding (R63).
describe('.ega-check-chip', () => {
  it('holds half the check room at each end while unpicked, with no padding off the scale, in tokens.css', () => {
    const tokens = readFileSync('src/shared/tokens.css', 'utf8');
    const rules = tokens.match(/\.ega-check-chip[^{]*\{[^}]*\}/g) ?? [];
    // Padding stays --chip-pad; two empty boxes plus their two gaps add up to the check plus its gap.
    expect(rules.filter((r) => r.includes('padding'))).toEqual([
      '.ega-check-chip {\n  padding-inline: var(--chip-pad);\n}',
    ]);
    expect(tokens).toMatch(
      /\.ega-check-chip:not\(\[aria-pressed='true'\], \[aria-checked='true'\], \.active\)::before,\s*\.ega-check-chip:not\(\[aria-pressed='true'\], \[aria-checked='true'\], \.active\)::after \{\s*content: '';\s*flex: none;\s*inline-size: calc\(\(var\(--chip-check\) - var\(--space-1\)\) \/ 2\);/,
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
    // The boxes take one --space-1 gap each, as the check does.
    expect(src).toMatch(/gap: var\(--space-1\);/);
    expect(src).not.toMatch(/var\(--space-1\)\) \/ 2|<Check size=\{\d+\}/);
    expect(src).not.toMatch(/padding(-inline)?: [^;]*var\(--space-\d\)[^;]*;\s*$/m);
  });
});
