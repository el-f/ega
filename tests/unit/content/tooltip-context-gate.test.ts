// @vitest-environment jsdom
import type { ComponentProps } from 'svelte';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Tooltip from '@/content/Tooltip.svelte';

type TipState = ComponentProps<typeof Tooltip>['tip'];

function handlers() {
  return {
    onclose: vi.fn(),
    oncancel: vi.fn(),
    onretry: vi.fn(),
    oncopy: vi.fn(),
    onexplain: vi.fn(),
    onopenoptions: vi.fn(),
  };
}

function baseTip(): TipState {
  return {
    srcText: 'hello',
    body: 'translation',
    loading: false,
    confidencePill: true,
    left: 10,
    top: 10,
  };
}

function mount(tip: TipState, opts: { settings?: boolean } = {}) {
  const { onopenoptions, ...rest } = handlers();
  return render(Tooltip, {
    props: {
      tip,
      clickOutsideDismiss: true,
      showSource: false,
      ...rest,
      ...(opts.settings === false ? {} : { onopenoptions }),
    },
  });
}

function row(c: HTMLElement, label: string): string | null {
  const dt = [...c.querySelectorAll('dt')].find((d) => d.textContent.trim() === label);
  return dt?.nextElementSibling?.textContent.replace(/\s+/g, ' ').trim() ?? null;
}

const detailsBtn = (c: ParentNode) =>
  c.querySelector<HTMLButtonElement>('button[aria-label="Show details about this reply"]');

/** Opens the details panel and returns the Page info row's text. */
async function pageInfo(c: HTMLElement): Promise<string> {
  const btn = detailsBtn(c);
  if (!btn) throw new Error('no details button');
  await fireEvent.click(btn);
  return c.querySelector('[data-ega-context-preview]')?.textContent ?? '';
}

const contextSent = { pageUrl: 'https://x.test', pageTitle: 'Page X', beforeText: 'foo' };

describe('Tooltip — what the details panel says about page info', () => {
  it('an explain re-run follows the Explain switch, which is the one the router applies', async () => {
    const { updateTask } = await import('@/shared/tasks');
    const { ensureSettings, resetSettingsCacheForTest } = await import('@/content/settings-cache');
    await updateTask('explain', { pageContext: false });
    resetSettingsCacheForTest();
    await ensureSettings();
    const rerun = mount({ ...baseTip(), task: 'translate', contextTask: 'explain', contextSent });
    expect(await pageInfo(rerun.container)).toContain('None sent');
    rerun.unmount();
    const plain = mount({ ...baseTip(), task: 'translate', contextSent });
    expect(await pageInfo(plain.container)).toContain('Page X');
    plain.unmount();
    await updateTask('explain', { pageContext: true });
    resetSettingsCacheForTest();
  });

  it('says page info was off for a task that does not send it, and shows it for Translate', async () => {
    const { ensureSettings } = await import('@/content/settings-cache');
    await ensureSettings();
    const off = mount({ ...baseTip(), task: 'summarize', contextSent });
    expect(await pageInfo(off.container)).toContain('None sent');
    off.unmount();
    const on = mount({ ...baseTip(), task: 'translate', contextSent });
    expect(await pageInfo(on.container)).toContain('Page X');
  });

  it('says none was sent when the request carried no page info', async () => {
    const { container } = mount({ ...baseTip(), contextSent: null });
    expect(await pageInfo(container)).toContain('None sent');
  });

  it('describes an image translate as the image, with no page info', async () => {
    // An image result tooltip gets no Settings handler, so no Settings link may render.
    const { container } = mount(
      { ...baseTip(), srcText: '', contextSent: null, imageUrl: 'data:image/png;base64,AAAA' },
      { settings: false },
    );
    expect(await pageInfo(container)).toContain('Not sent with images');
    expect(row(container, 'Your text')).toBe('An image');
    expect(row(container, 'Earlier messages')).toBe('None');
    // The Record request details hint still names Settings, as plain text.
    expect(container.textContent).toContain('Turn on Record request details in Settings');
    const buttons = [...container.querySelectorAll('button')].map((b) => b.textContent.trim());
    expect(buttons).not.toContain('Settings');
  });

  it('shows the instructions section for an image explain', async () => {
    const { container } = mount({
      ...baseTip(),
      srcText: '',
      contextSent: null,
      contextTask: 'explain',
      imageUrl: 'data:image/png;base64,AAAA',
    });
    expect(await pageInfo(container)).toContain('None sent');
    // The instructions are the sent text itself now, recorded on the reply's meta.
    expect(container.querySelector('[data-ega-instructions]')).not.toBeNull();
  });

  // Image tooltips set no contextSent and carry no meta: they get no Details button at all.
  it('has no details button when the reply recorded nothing at all', () => {
    const { container } = mount(baseTip());
    expect(detailsBtn(container)).toBeNull();
  });

  it('says the tooltip sends no earlier messages', async () => {
    const { container } = mount({ ...baseTip(), contextSent: null });
    await pageInfo(container);
    expect(row(container, 'Earlier messages')).toBe(
      'None. The tooltip does not send earlier messages.',
    );
  });
});
