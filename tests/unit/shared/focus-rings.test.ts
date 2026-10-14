import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseRules } from '../../../scripts/shadow-css-lint';

// jsdom loads no component CSS, so this reads the rules; the design-rules e2e flow checks the computed ring.

function rules(file: string) {
  const src = readFileSync(file, 'utf8');
  const css = /<style[^>]*>([\s\S]*?)<\/style>/.exec(src)?.[1] ?? src;
  return parseRules(css);
}

function decls(file: string, selector: string): Map<string, string> {
  const found = rules(file).find((r) => r.context === '' && r.selectors.includes(selector));
  if (!found) throw new Error(`no rule ${selector} in ${file}`);
  return found.decls;
}

const RING = '2px solid var(--color-accent)';

describe('focus rings (K-3)', () => {
  it.each([
    'src/shared/ui/Select.svelte',
    'src/shared/ui/Textarea.svelte',
    'src/shared/ui/RadioGroup.svelte',
    'src/shared/ui/ResetField.svelte',
    'src/shared/ui/Combobox.svelte',
    'src/shared/ui/Input.svelte',
    'src/shared/ui/Segmented.svelte',
    'src/options/components/SectionReset.svelte',
    'src/options/components/prompt/PromptEditor.svelte',
    'src/options/components/prompt/VariablePicker.svelte',
  ])('%s never switches the ring off in a focus rule', (file) => {
    const hidden = rules(file)
      .filter((r) => r.selectors.some((s) => /:focus(?:-visible|-within)?\b/.test(s)))
      .filter((r) => r.decls.get('outline') === 'none')
      .flatMap((r) => r.selectors);
    expect(hidden).toEqual([]);
  });

  it('a textarea keeps the page ring: its base rule does not remove the outline', () => {
    expect(decls('src/shared/ui/Textarea.svelte', '.ega-textarea').get('outline')).toBeUndefined();
  });

  it.each([
    ['src/shared/ui/Input.svelte', '.ega-input-row:focus-within'],
    ['src/shared/ui/Combobox.svelte', '.ega-combobox-row:has(.ega-combobox-input:focus-visible)'],
    ['src/options/components/prompt/VariablePicker.svelte', '.vp-search:focus-visible'],
  ])('%s draws the 2px accent ring on %s', (file, selector) => {
    expect(decls(file, selector).get('outline')).toBe(RING);
  });

  it('a focused radio stays round, so it never reads as a checkbox (D3-01)', () => {
    expect(
      decls('src/shared/ui/RadioGroup.svelte', '.ega-radio-item:focus-visible').get(
        'border-radius',
      ),
    ).toBe('9999px');
  });

  it.each([
    ['src/options/components/SectionReset.svelte', '.section-reset:hover'],
    ['src/shared/ui/ResetField.svelte', '.reset-field:hover'],
  ])(
    '%s keeps its hover tint off the focus rule, so focus does not look like hover',
    (file, sel) => {
      const hover = rules(file).find((r) => r.selectors.includes(sel));
      expect(hover?.selectors.some((s) => s.includes(':focus'))).toBe(false);
    },
  );
});
