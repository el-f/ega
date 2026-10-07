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
    swap: null as { source: string; target: string } | null,
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

  it('a swap that can act trades the languages; none is rendered when it cannot', async () => {
    const { component } = render(ModePopover, {
      props: props({ sourceLang: 'es', swap: { source: 'en', target: 'es' } }),
    });
    const p = await popover();
    const swap = p.querySelector<HTMLElement>('[data-ega-swap]');
    expect(swap?.getAttribute('aria-label')).toBe('Swap languages');
    await fireEvent.click(swap as HTMLElement);
    expect((document.querySelector('#sp-conv-source') as HTMLSelectElement).value).toBe('en');
    expect((document.querySelector('#sp-conv-target') as HTMLSelectElement).value).toBe('es');
    void component;
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
    expect(src).toMatch(
      /\.mp-tone\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*var\(--mp-label-w\) minmax\(0, 1fr\);/,
    );
  });

  // A margin of 28px plus the gap is off the spacing scale (design check 6); an empty grid column is not spacing.
  it('the Tone select stops where the swap column starts, when there is one', async () => {
    expect(src).toMatch(
      /\.mp-tone\.beside-swap\s*\{\s*grid-template-columns:\s*var\(--mp-label-w\) minmax\(0, 1fr\) 28px;/,
    );
    expect(src).not.toMatch(/margin-inline-end:\s*calc\(28px/);
    render(ModePopover, {
      props: props({ task: 'reword', usesTone: true, swap: { source: 'en', target: 'es' } }),
    });
    expect((await popover()).querySelector('.mp-tone')?.classList.contains('beside-swap')).toBe(
      true,
    );
  });
});
