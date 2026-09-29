// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import TemplatePillPreview from '@/options/components/TemplatePillPreview.svelte';

function props(over: Record<string, unknown> = {}) {
  return {
    task: 'translate' as const,
    system: 'You translate to {{targetLangLabel}} from {{sourceLangLabel}}.',
    user: 'Translate the following: {{text}}',
    resolvedValues: {
      text: 'Hello world',
      targetLangLabel: 'English',
      sourceLangLabel: 'auto',
    } as Record<string, string>,
    ...over,
  };
}

describe('TemplatePillPreview', () => {
  it('renders one pill per {{slot}} match across system + user', () => {
    const { container } = render(TemplatePillPreview, { props: props() });
    const pills = container.querySelectorAll('.tpl-slot-pill');
    // system has 2 slots (targetLangLabel, sourceLangLabel),
    // user has 1 slot (text) → 3 pills total.
    expect(pills.length).toBe(3);
    const names = Array.from(pills).map((p) => p.getAttribute('data-slot'));
    expect(names).toContain('text');
    expect(names).toContain('targetLangLabel');
    expect(names).toContain('sourceLangLabel');
  });

  it('renders snippet pills for @@snippet@@ tokens', () => {
    const { container } = render(TemplatePillPreview, {
      props: props({
        system: 'Header @@greeting@@ body.',
        user: '{{text}}',
      }),
    });
    const snippetPills = container.querySelectorAll('.tpl-snippet-pill');
    expect(snippetPills.length).toBe(1);
    expect(snippetPills[0]?.getAttribute('data-snippet')).toBe('greeting');
  });

  it('renders no error banner for a missing required slot — the save error owns that message', () => {
    const { container } = render(TemplatePillPreview, {
      props: props({
        system: 'Translate to {{targetLangLabel}}.',
        user: 'no required slot here',
      }),
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('renders literal text between slots unchanged', () => {
    const { container } = render(TemplatePillPreview, {
      props: props({
        system: '',
        user: 'before {{text}} after',
      }),
    });
    const userBlock = container.querySelector('[data-ega-template-pill-user]');
    expect(userBlock?.textContent).toContain('before');
    expect(userBlock?.textContent).toContain('after');
  });

  it('marks custom (non-registry) slots with the custom class', () => {
    const { container } = render(TemplatePillPreview, {
      props: props({
        system: 'Persona: {{persona}}',
        user: '{{text}}',
      }),
    });
    const personaPill = container.querySelector('.tpl-slot-pill[data-slot="persona"]');
    expect(personaPill?.classList.contains('custom')).toBe(true);
  });
});
