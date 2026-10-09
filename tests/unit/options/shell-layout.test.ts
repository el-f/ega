import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseRules } from '../../../scripts/shadow-css-lint';

// jsdom has no layout; the design-rules e2e flow measures these at 600px and 320px.

function decls(file: string, selector: string, context = ''): Map<string, string> {
  const src = readFileSync(file, 'utf8');
  const css = /<style[^>]*>([\s\S]*?)<\/style>/.exec(src)?.[1] ?? '';
  const found = parseRules(css).find(
    (r) => r.context === context && r.selectors.includes(selector),
  );
  if (!found) throw new Error(`no rule ${selector} (${context || 'top level'}) in ${file}`);
  return found.decls;
}

describe('options shell layout', () => {
  it('the icon-only rail draws its focus label as a box beside the icon (KSR-22)', () => {
    const label = decls(
      'src/options/OptionsNav.svelte',
      '.options-nav-item[data-tooltip]:focus-visible::after',
      '@container options (max-width: 880px)',
    );
    expect(label.get('top')).toBe('50%');
    expect(label.get('bottom')).toBe('auto');
  });

  it('the header draws no hover label over controls whose label is already on screen', () => {
    const label = decls(
      'src/options/OptionsHeader.svelte',
      '.options-header [data-tooltip]:focus-visible::after',
      '@container options (width > 600px)',
    );
    expect(label.get('content')).toBe('none');
  });

  it('the header wraps its actions under the title instead of pushing the page sideways (D3-04)', () => {
    expect(decls('src/options/OptionsHeader.svelte', '.options-header').get('flex-wrap')).toBe(
      'wrap',
    );
  });
});
