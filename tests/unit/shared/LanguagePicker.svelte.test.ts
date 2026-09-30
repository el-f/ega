// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import LanguagePicker from '@/shared/components/LanguagePicker.svelte';
import type { Variety } from '@/shared/types';
import { preset } from '@tests/_helpers/lang';

const mkBuiltin = (id: string, label: string): Variety => ({
  id: preset(id),
  label,
  hint: '',
  examples: [],
  kind: 'builtin',
  disabled: false,
  hasOverrides: false,
});

const mkCustom = (id: string, label: string): Variety => ({
  id: preset(id),
  label,
  hint: '',
  examples: [],
  kind: 'custom',
  disabled: false,
  hasOverrides: false,
  createdAt: 1,
});

describe('LanguagePicker', () => {
  it('renders the auto entry when includeAuto is true', () => {
    const { container } = render(LanguagePicker, {
      props: {
        id: 'test',
        varieties: [],
        value: 'auto',
        includeAuto: true,
      },
    });
    const select = container.querySelector('select[data-ega-lang-picker]');
    expect(select).not.toBeNull();
    if (!select) throw new Error('no select');
    const options = Array.from(select.querySelectorAll('option'));
    // First option must be the auto entry.
    const firstOption = options[0];
    if (!firstOption) throw new Error('no options');
    expect(firstOption.getAttribute('value')).toBe('auto');
    expect(firstOption.textContent).toContain('Auto');
  });

  it('gives every option dir="auto" so an RTL custom label keeps its punctuation side', () => {
    const { container } = render(LanguagePicker, {
      props: {
        id: 'test',
        varieties: [mkBuiltin('arabizi', 'Arabizi'), mkCustom('heb', 'ערבית (מדוברת)')],
        value: 'auto',
        includeAuto: true,
      },
    });
    const options = Array.from(container.querySelectorAll('option'));
    expect(options.length).toBeGreaterThan(2);
    expect(options.every((o) => o.getAttribute('dir') === 'auto')).toBe(true);
  });

  it('omits the auto entry when includeAuto is false (target-picker shape)', () => {
    const { container } = render(LanguagePicker, {
      props: {
        id: 'test',
        varieties: [],
        value: 'en',
        includeAuto: false,
      },
    });
    const options = Array.from(container.querySelectorAll('option'));
    expect(options.some((o) => o.getAttribute('value') === 'auto')).toBe(false);
  });

  it('renders three optgroups: Built-in / Custom / Languages when all present', () => {
    const { container } = render(LanguagePicker, {
      props: {
        id: 'test',
        varieties: [mkBuiltin('arabizi', 'Arabizi'), mkCustom('c1', 'My Custom')],
        value: 'en',
        includeAuto: true,
      },
    });
    const groups = Array.from(container.querySelectorAll('optgroup')).map((g) =>
      g.getAttribute('label'),
    );
    expect(groups).toEqual(['Built-in', 'Custom', 'Languages']);
  });

  it('hides the Built-in group when there are no enabled built-ins', () => {
    const { container } = render(LanguagePicker, {
      props: {
        id: 'test',
        varieties: [mkCustom('c1', 'Custom Only')],
        value: 'en',
        includeAuto: false,
      },
    });
    const groups = Array.from(container.querySelectorAll('optgroup')).map((g) =>
      g.getAttribute('label'),
    );
    expect(groups).toEqual(['Custom', 'Languages']);
  });

  it('hides the Custom group when there are no customs', () => {
    const { container } = render(LanguagePicker, {
      props: {
        id: 'test',
        varieties: [mkBuiltin('arabizi', 'Arabizi')],
        value: 'en',
        includeAuto: false,
      },
    });
    const groups = Array.from(container.querySelectorAll('optgroup')).map((g) =>
      g.getAttribute('label'),
    );
    expect(groups).toEqual(['Built-in', 'Languages']);
  });

  it('Languages optgroup includes the common ISO entries (en / fr / ja / zh-TW)', () => {
    const { container } = render(LanguagePicker, {
      props: {
        id: 'test',
        varieties: [],
        value: 'en',
        includeAuto: false,
      },
    });
    const langValues = new Set(
      Array.from(container.querySelectorAll('optgroup[label="Languages"] option')).map((o) =>
        o.getAttribute('value'),
      ),
    );
    expect(langValues.has('en')).toBe(true);
    expect(langValues.has('fr')).toBe(true);
    expect(langValues.has('ja')).toBe(true);
    expect(langValues.has('zh-TW')).toBe(true);
  });

  it('filters out disabled varieties', () => {
    const vs: Variety[] = [
      mkBuiltin('arabizi', 'Arabizi'),
      { ...mkBuiltin('leetspeak', 'Leetspeak'), disabled: true },
    ];
    const { container } = render(LanguagePicker, {
      props: { id: 'test', varieties: vs, value: 'en', includeAuto: false },
    });
    const presetValues = Array.from(
      container.querySelectorAll('optgroup[label="Built-in"] option'),
    ).map((o) => o.getAttribute('value'));
    expect(presetValues).toContain('arabizi');
    expect(presetValues).not.toContain('leetspeak');
  });

  it('uses the id prop on the underlying select (a11y: <label for> wiring)', () => {
    const { container } = render(LanguagePicker, {
      props: { id: 'custom-id-xyz', varieties: [], value: 'en' },
    });
    expect(container.querySelector('select')?.id).toBe('custom-id-xyz');
  });
});
