// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/svelte';
import { parseRules } from '../../../scripts/shadow-css-lint';
import Slider from '@/shared/ui/Slider.svelte';
import SectionCard from '@/shared/ui/SectionCard.svelte';
import { textSnippet } from './ui/_helpers';

// jsdom loads no component CSS, so these read the rules; the e2e design-rules flow measures the rendered page.

function decls(file: string, selector: string, context = ''): Map<string, string> {
  const src = readFileSync(file, 'utf8');
  const css = /<style[^>]*>([\s\S]*?)<\/style>/.exec(src)?.[1] ?? src;
  const found = parseRules(css).find(
    (r) => r.context === context && r.selectors.includes(selector),
  );
  if (!found) throw new Error(`no rule ${selector} (${context || 'top level'}) in ${file}`);
  return found.decls;
}

describe('shared look', () => {
  it('a size-md button is 32px tall with or without an icon (RD2-08, K-19)', () => {
    const md = decls('src/shared/ui/Button.svelte', '.size-md');
    expect(md.get('min-height')).toBe('32px');
    expect(md.get('padding')).toBe('0 var(--space-3)');
  });

  it('a size-md Input is 32px with its border, like the button beside it (R24)', () => {
    const md = decls('src/shared/ui/Input.svelte', '.size-md .ega-input');
    expect(md.get('min-height')).toBe('30px');
    expect(md.get('padding')).toBe('0 var(--space-3)');
  });

  it('the reset pill in a dialog footer is as tall as Done (spec 5.0 rule 7)', () => {
    expect(
      decls('src/options/components/SectionReset.svelte', '.ega-dialog-actions .section-reset').get(
        'min-height',
      ),
    ).toBe('32px');
  });

  it('a radio description is secondary text, muted like every hint (RD2-14)', () => {
    expect(decls('src/shared/ui/RadioGroup.svelte', '.ega-radio-description').get('color')).toBe(
      'var(--color-muted)',
    );
  });

  it('an empty-state body uses the 80ch description cap, so one sentence stays one line (R1-30)', () => {
    expect(decls('src/shared/components/EmptyState.svelte', '.desc').get('max-inline-size')).toBe(
      '80ch',
    );
  });

  it('the picked choice card keeps a second edge in forced colours (D3-03, K-21)', () => {
    expect(
      decls(
        'src/options/components/ChoiceCards.svelte',
        '.choice-cards .choice-card.active',
        '@media (forced-colors: active)',
      ).get('outline-offset'),
    ).toBe('2px');
  });

  it('the default tick stays drawn in forced colours instead of cutting the track (D3-06)', () => {
    const tick = decls('src/shared/ui/Slider.svelte', '.tick', '@media (forced-colors: active)');
    expect(tick.get('forced-color-adjust')).toBe('none');
    expect(tick.get('background')).toBe('CanvasText');
  });

  it('a card of groups keeps 24px between them, twice the row gap (R1-14, R14)', () => {
    const file = 'src/shared/ui/SectionCard.svelte';
    expect(decls(file, '.ega-section-card-body').get('gap')).toBe('var(--space-3)');
    expect(decls(file, '.ega-section-card-body.groups').get('gap')).toBe('var(--space-5)');
    const { container } = render(SectionCard, {
      props: { title: 'Timeouts and checks', groups: true, children: textSnippet('x') },
    });
    expect(container.querySelector('.ega-section-card-body')?.classList.contains('groups')).toBe(
      true,
    );
  });

  it('the combobox chevron is a 24px target at the least (R44, C-13)', () => {
    expect(
      decls('src/shared/ui/Combobox.svelte', '.ega-combobox-row .ega-combobox-toggle').get(
        'min-width',
      ),
    ).toBe('24px');
  });

  it('a shortcut row wraps Clear under the value instead of pushing a narrow page sideways (R16)', () => {
    expect(
      decls('src/shared/components/ShortcutInput.svelte', '.shortcut-input').get('flex-wrap'),
    ).toBe('wrap');
  });

  it('the shortcut sheet breaks the chrome:// address in a 256px side panel instead of overrunning (R16)', () => {
    expect(
      decls('src/shared/components/ShortcutOverlay.svelte', '.shortcut-foot code').get(
        'overflow-wrap',
      ),
    ).toBe('anywhere');
  });

  it('the slider pill is the shared Badge, which keeps an edge in forced colours (D3-06)', () => {
    const { getByText } = render(Slider, {
      props: {
        label: 'Remember backend status for',
        value: 30,
        min: 0,
        max: 60,
        badge: 'Experimental',
        onchange: () => {},
      },
    });
    expect(getByText('Experimental').closest('.ega-badge')?.className).toMatch(/variant-warning/);
  });
});
