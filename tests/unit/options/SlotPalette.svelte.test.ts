// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SlotPalette from '@/options/components/SlotPalette.svelte';
import type { PromptTemplate } from '@/shared/types';

function baseProps(over: Record<string, unknown> = {}) {
  const template: PromptTemplate = { system: '', user: '{{text}}' };
  return {
    task: 'translate' as const,
    template,
    resolvedValues: {} as Record<string, string>,
    onInsert: vi.fn(),
    ...over,
  };
}

describe('SlotPalette', () => {
  it('renders one chip per built-in slot for the task', () => {
    const { container } = render(SlotPalette, { props: baseProps() });
    const chips = container.querySelectorAll('[data-ega-slot-row="builtin"] [data-ega-slot-chip]');
    // translate-task slots: text, langLabel, langHint, targetLangLabel,
    // examples, context, detectiveInstr — 7 visible chips.
    expect(chips.length).toBeGreaterThanOrEqual(6);
    const names = Array.from(chips).map((c) => c.getAttribute('data-ega-slot-chip'));
    expect(names).toContain('text');
    expect(names).toContain('langLabel');
  });

  it('clicking a built-in slot chip calls onInsert with the {{token}}', async () => {
    const onInsert = vi.fn();
    const { container } = render(SlotPalette, {
      props: baseProps({ onInsert }),
    });
    const chip = container.querySelector('[data-ega-slot-chip="text"]') as HTMLButtonElement | null;
    expect(chip).toBeTruthy();
    if (!chip) return;
    await fireEvent.click(chip);
    expect(onInsert).toHaveBeenCalledWith('{{text}}');
  });

  it('flags required slot when missing from user template', () => {
    const template: PromptTemplate = { system: '', user: 'no slot here' };
    const { container } = render(SlotPalette, {
      props: baseProps({ template }),
    });
    const textChip = container.querySelector(
      '[data-ega-slot-chip="text"]',
    ) as HTMLButtonElement | null;
    expect(textChip?.classList.contains('required-missing')).toBe(true);
  });

  it('does NOT flag the required slot when present in user template', () => {
    const template: PromptTemplate = { system: '', user: 'TEXT: {{text}}' };
    const { container } = render(SlotPalette, {
      props: baseProps({ template }),
    });
    const textChip = container.querySelector(
      '[data-ega-slot-chip="text"]',
    ) as HTMLButtonElement | null;
    expect(textChip?.classList.contains('required-missing')).toBe(false);
  });

  it('detects custom slots from the template and renders them in the custom row', () => {
    const template: PromptTemplate = {
      system: 'You are {{persona}}',
      user: '{{text}} — extra: {{myVar}}',
    };
    const { container } = render(SlotPalette, {
      props: baseProps({ template }),
    });
    const customChips = container.querySelectorAll(
      '[data-ega-slot-row="custom"] [data-ega-slot-chip]',
    );
    const names = Array.from(customChips).map((c) => c.getAttribute('data-ega-slot-chip'));
    expect(names).toContain('persona');
    expect(names).toContain('myVar');
  });

  it('names the slot source in a visually-hidden span for screen readers', () => {
    const { container } = render(SlotPalette, { props: baseProps() });
    const textChip = container.querySelector(
      '[data-ega-slot-chip="text"]',
    ) as HTMLButtonElement | null;
    expect(textChip).toBeTruthy();
    // `text` is a request-source slot; the sr-only span must say so.
    const srSpan = textChip?.querySelector('.ega-sr-only');
    expect(srSpan?.textContent).toContain('request');
  });
});

describe('the global palette (Translate task dialog)', () => {
  const chipNames = (container: HTMLElement): (string | null)[] =>
    Array.from(
      container.querySelectorAll('[data-ega-slot-row="builtin"] [data-ega-slot-chip]'),
    ).map((c) => c.getAttribute('data-ega-slot-chip'));

  it('offers the explain slots no single task fills, so the shared template can carry them', () => {
    const { container } = render(SlotPalette, { props: baseProps({ allTaskSlots: true }) });
    expect(chipNames(container)).toEqual(expect.arrayContaining(['explainInstr', 'explainField']));
  });

  it('a task palette does not offer them', () => {
    const { container } = render(SlotPalette, { props: baseProps({ task: 'summarize' }) });
    expect(chipNames(container)).not.toContain('explainInstr');
  });
});
