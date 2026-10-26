// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import ModePopover from '@/sidepanel/conversation/ModePopover.svelte';
import { SHIPPED_TASK_VIEWS } from '@/shared/task-view';
import { readFileSync } from 'node:fs';

function props(over: Record<string, unknown> = {}) {
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  return {
    open: true,
    anchor,
    onClose: vi.fn(),
    task: 'translate',
    sourceLang: 'auto',
    targetLang: 'en',
    tone: 'neutral' as const,
    taskViews: SHIPPED_TASK_VIEWS,
    varieties: [],
    usesTone: false,
    swap: { off: 'Swap needs a reply to detect its language' } as
      { source: string; target: string } | { off: string },
    imageBlocked: null as ReadonlySet<string> | null,
    contextEnabled: true,
    taskSendsPage: true,
    pageContextLevel: 'minimal' as const,
    onContextLevelChange: vi.fn(),
    onOpenSettings: vi.fn(),
    ...over,
  };
}

async function popover(): Promise<HTMLElement> {
  return waitFor(() => {
    const p = document.querySelector<HTMLElement>('[data-ega-mode-popover]');
    if (!p) throw new Error('not open');
    return p;
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Next message popover', () => {
  it('is titled Next message and shows Task, Language and Page info in that order', async () => {
    render(ModePopover, { props: props() });
    const p = await popover();
    expect(document.querySelector('.ega-popover-title')?.textContent).toBe('Next message');
    const labels = Array.from(p.querySelectorAll('.mp-label, .ctx-level-label')).map((l) =>
      l.textContent.trim(),
    );
    expect(labels).toEqual(['Task', 'Language', 'Page info']);
    expect(p.querySelector('[data-ega-tone-select]')).toBeNull();
  });

  it('shows the tone only for a task whose prompt has one', async () => {
    render(ModePopover, { props: props({ task: 'reword', usesTone: true }) });
    expect((await popover()).querySelector('[data-ega-tone-select]')).not.toBeNull();
  });

  it('a swap that can act trades the languages', async () => {
    const { component } = render(ModePopover, {
      props: props({ sourceLang: 'es', swap: { source: 'en', target: 'es' } }),
    });
    const p = await popover();
    const swap = p.querySelector<HTMLElement>('[data-ega-swap]');
    expect(swap?.getAttribute('aria-label')).toBe('Swap languages');
    // Positive control for the off case: a live swap keeps its tooltip.
    expect(swap?.hasAttribute('data-tooltip-trigger')).toBe(true);
    expect(swap?.hasAttribute('aria-describedby')).toBe(false);
    expect(document.getElementById('mp-swap-why')).toBeNull();
    await fireEvent.click(swap as HTMLElement);
    expect((document.querySelector('#sp-conv-source') as HTMLSelectElement).value).toBe('en');
    expect((document.querySelector('#sp-conv-target') as HTMLSelectElement).value).toBe('es');
    void component;
  });

  // R63: removing it would resize From and To, so it shows off. R4: like Options, the reason is a visible
  // line the button points at; a tooltip would add its own description, so the reason would be read twice.
  it.each([
    ['auto', 'en', 'Swap needs a reply to detect its language'],
    ['es', 'es', 'Swap needs two different languages'],
  ])(
    'a swap that cannot act (From %s, To %s) stays on screen, off, and says why once',
    async (sourceLang, targetLang, why) => {
      render(ModePopover, { props: props({ sourceLang, targetLang, swap: { off: why } }) });
      const p = await popover();
      const swap = p.querySelector<HTMLElement>('[data-ega-swap]');
      expect(swap?.getAttribute('aria-label')).toBe('Swap languages');
      swap?.focus();
      await fireEvent.focus(swap as HTMLElement);
      const describedBy = swap?.getAttribute('aria-describedby') ?? '';
      const note = document.getElementById(describedBy);
      expect(note?.textContent.trim()).toBe(why);
      expect(p.contains(note)).toBe(true);
      expect(swap?.hasAttribute('data-tooltip-trigger')).toBe(false);
      expect(swap?.getAttribute('aria-disabled')).toBe('true');
      expect(swap?.hasAttribute('disabled')).toBe(false);
      await fireEvent.click(swap as HTMLElement);
      expect((document.querySelector('#sp-conv-source') as HTMLSelectElement).value).toBe(
        sourceLang,
      );
      expect((document.querySelector('#sp-conv-target') as HTMLSelectElement).value).toBe(
        targetLang,
      );
    },
  );

  // R63: the popover grows upward, so a reason line that came and went moved From and To by its height.
  it('keeps the reason line when Swap turns on, empty and pointed at by nothing', async () => {
    const { rerender } = render(ModePopover, { props: props() });
    const section = (await popover()).querySelector('section[aria-labelledby="mp-lang"]');
    const shape = () => [...(section?.children ?? [])].map((c) => c.tagName);
    const off = shape();
    const line = section?.lastElementChild;
    expect(line?.textContent.trim()).toBe('Swap needs a reply to detect its language');
    await rerender({ sourceLang: 'es', swap: { source: 'en', target: 'es' } });
    expect(shape()).toEqual(off);
    expect(section?.lastElementChild).toBe(line);
    // Nothing for a screen reader to land on: no text, no child, no id.
    expect(line?.textContent).toBe('');
    expect(line?.children).toHaveLength(0);
    expect(document.getElementById('mp-swap-why')).toBeNull();
    expect(section?.querySelector('[data-ega-swap]')?.hasAttribute('aria-describedby')).toBe(false);
  });

  it('with an image, tasks that cannot read it are marked and a note says why', async () => {
    const blocked = new Set(SHIPPED_TASK_VIEWS.filter((v) => !v.image).map((v) => v.id));
    render(ModePopover, { props: props({ imageBlocked: blocked }) });
    const p = await popover();
    expect(p.textContent).toContain('Images work with Translate and Explain');
    expect(
      p
        .querySelector('[data-ega-task="summarize"] button, [data-ega-task="summarize"]')
        ?.getAttribute('aria-disabled'),
    ).toBe('true');
    expect(p.querySelector('[data-ega-task="explain"]')?.getAttribute('aria-disabled')).toBeNull();
  });

  it('page info turned off in Settings says so and offers the way back', async () => {
    const onOpenSettings = vi.fn();
    render(ModePopover, { props: props({ contextEnabled: false, onOpenSettings }) });
    const p = await popover();
    expect(p.textContent).toContain('Page info is off.');
    const btn = Array.from(p.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Turn on in Settings'),
    );
    await fireEvent.click(btn as HTMLElement);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('names enabled image-reading custom tasks and identifies the saved page setting', async () => {
    const translate = SHIPPED_TASK_VIEWS.find((v) => v.id === 'translate');
    if (!translate) throw new Error('no Translate task');
    const views = [
      ...SHIPPED_TASK_VIEWS.map((v) => (v.id === 'explain' ? { ...v, disabled: true } : v)),
      { ...translate, id: 'photo', kind: 'custom' as const, label: 'Read chart' },
    ];
    render(ModePopover, { props: props({ taskViews: views, imageBlocked: new Set(['grammar']) }) });
    const p = await popover();
    expect(p.textContent).toContain('Images work with Translate and Read chart');
    expect(p.textContent).not.toContain('Images work with Translate and Explain');
    expect(p.textContent).toContain('Saved for future messages');
  });

  it('a task that sends no page info has no Page info section', async () => {
    render(ModePopover, { props: props({ task: 'summarize', taskSendsPage: false }) });
    expect((await popover()).textContent).not.toContain('Page info');
  });
});

// Spec R15: stacked selects share one left and one right edge (measured on the captures; jsdom has no layout).
describe('the Tone select lines up with From and To', () => {
  const src = readFileSync('src/sidepanel/conversation/ModePopover.svelte', 'utf8');

  it('one label column for From, To and Tone', () => {
    expect(src).toMatch(/\.mp-langs\s*\{[^}]*grid-template-columns:\s*var\(--mp-label-w\)/);
    expect(src).toMatch(/\.mp-tone\s*\{[^}]*display:\s*grid;/);
  });

  // A margin of 28px plus the gap is off the spacing scale (design check 6); an empty grid column is not spacing.
  it('the Tone select stops where the swap column starts', () => {
    expect(src).toMatch(
      /\.mp-tone\s*\{[^}]*grid-template-columns:\s*var\(--mp-label-w\) minmax\(0, 1fr\) 28px;/,
    );
    expect(src).not.toMatch(/margin-inline-end:\s*calc\(28px/);
  });
});

// The panel has one h1 (sr-only "Ega"), and About this reply uses h2, so these section titles are h2.
describe('section headings sit right under the panel h1', () => {
  it('names Task, Language and Page info with h2', async () => {
    render(ModePopover, { props: props({ contextEnabled: false }) });
    const p = await popover();
    expect([...p.querySelectorAll('h2')].map((h) => h.textContent.trim())).toEqual([
      'Task',
      'Language',
      'Page info',
    ]);
    expect(p.querySelector('h3, h4, h5, h6')).toBeNull();
  });
});

describe('Tone reads like From and To', () => {
  it('uses the same label style as the language rows', async () => {
    render(ModePopover, { props: props({ task: 'reword', usesTone: true }) });
    const p = await popover();
    const from = p.querySelector('label[for="sp-conv-source"]');
    const tone = p.querySelector('label[for="sp-tone"]');
    expect(tone?.className).toBe(from?.className);
  });
});

// In a short panel the popover scrolls: the cut line needs a cue, and the end needs room below its last line.
describe('a popover taller than the panel', () => {
  const src = readFileSync('src/sidepanel/conversation/ModePopover.svelte', 'utf8');

  it('shows a shadow at the edge where more is hidden, and leaves room under the last line', () => {
    expect(src).toMatch(/:global\(\.ega-popover:has\(\[data-ega-mode-popover\]\)\)\s*\{[^}]*local/);
    expect(src).toMatch(/\.mp\s*\{[^}]*padding-block-end:\s*var\(--space-3\)/);
  });
});
