// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import type { Scope } from '@/shared/template-scope';
import TemplateEditorScopeBanner from '@/options/components/TemplateEditorScopeBanner.svelte';

function bannerText(scope: Scope): string | null {
  const { container } = render(TemplateEditorScopeBanner, { props: { scope } });
  return container.querySelector('[data-ega-template-scope-banner]')?.textContent ?? null;
}

describe('TemplateEditorScopeBanner', () => {
  it('does not render a banner for the global template', () => {
    expect(bannerText({ scope: 'global' })).toBeNull();
  });

  it('names the task override and its target', () => {
    const text = bannerText({ scope: 'task', task: 'summarize' });
    expect(text).toContain('Per-task override');
    expect(text).toContain('Summarize');
  });

  it('uses the built-in label for a known preset', () => {
    const text = bannerText({ scope: 'preset', presetId: 'arabizi' });
    expect(text).toContain('Per-language override');
    expect(text).toContain('Arabizi');
  });

  it('falls back to the raw id for a preset it cannot resolve', () => {
    expect(bannerText({ scope: 'preset', presetId: 'removed-custom-preset' })).toContain(
      'removed-custom-preset',
    );
  });
});
