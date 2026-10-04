// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import RulesEditorEmpty from '@/options/components/RulesEditorEmpty.svelte';

describe('RulesEditorEmpty', () => {
  it('mounts the empty state with no CTA', () => {
    const { container } = render(RulesEditorEmpty);
    const empty = container.querySelector('[data-ega-rules-empty]');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toMatch(/No rules yet/);
    expect(container.querySelector('.cta')).toBeNull();
  });
});
