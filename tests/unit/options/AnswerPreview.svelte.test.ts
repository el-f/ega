// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import AnswerPreview from '@/options/components/AnswerPreview.svelte';
import { customAnswerSpec } from '@/shared/answer/custom';
import { parseSettings } from '@/shared/settings-schema';
import { sendMsg } from '@/shared/messages';
import type { CustomTaskInput } from '@/shared/tasks';
import type { AnswerSpec } from '@/shared/answer/spec';

vi.mock('@/shared/messages', () => ({ sendMsg: vi.fn() }));
const send = vi.mocked(sendMsg);
const draft: CustomTaskInput = {
  label: 'Outline',
  system: 'Make an outline.',
  user: '{{text}}',
  output: 'plain',
  pageContext: false,
  image: false,
  glossary: false,
  answer: {
    v: 1,
    fields: [{ key: 'outline', label: 'Outline', kind: 'list', role: 'main', required: true }],
  },
};
const spec = customAnswerSpec(draft);
beforeEach(() => {
  send.mockReset();
});

/** Renders the preview with Example reply open, as a user sees it after one click. */
async function shown(
  props: Partial<{ s: ReturnType<typeof parseSettings>; spec: AnswerSpec }> = {},
) {
  const view = render(AnswerPreview, { draft, spec, s: parseSettings({}), ...props });
  await fireEvent.click(view.getByRole('button', { name: 'Example reply' }));
  return view;
}
const tryButton = (view: Awaited<ReturnType<typeof shown>>): HTMLElement =>
  view.getByRole('button', { name: /^Try/ });

describe('Example reply', () => {
  it('is one closed toggle; open, it says the values are examples, never a placeholder answer', async () => {
    const view = render(AnswerPreview, { draft, spec, s: parseSettings({}) });
    const toggle = view.getByRole('button', { name: 'Example reply' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(view.queryByLabelText('Sample text')).toBeNull();
    await fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(view.getByText('Example values, not a real reply')).toBeTruthy();
    expect(view.getByText('Example item')).toBeTruthy();
    expect(view.container.textContent).not.toMatch(
      /Your answer appears here|Sample values|backend\./,
    );
  });

  it('a text answer and a notes field read as examples', async () => {
    const card = customAnswerSpec({ output: 'card' });
    const view = await shown({ spec: card });
    expect(view.getByText('Example answer')).toBeTruthy();
    expect(view.getByText('Example notes')).toBeTruthy();
  });

  it('Try names the backend that answers first, in one width with Stop', async () => {
    const view = await shown({ s: parseSettings({ anthropicApiKey: 'k' }) });
    const tryIt = tryButton(view);
    expect(tryIt.textContent.trim()).toBe('Try with Anthropic');
    expect(
      [...tryIt.querySelectorAll('[data-label]')].map((s) => s.getAttribute('data-label')),
    ).toEqual(['Try with Anthropic', 'Stop']);
  });

  it('with no backend it can name for sure, Try says only Try it', async () => {
    const view = await shown();
    expect(tryButton(view).textContent.trim()).toBe('Try it');
  });

  it('Try is never disabled; with no sample a click says why and sends nothing', async () => {
    const view = await shown();
    await fireEvent.input(view.getByLabelText('Sample text'), { target: { value: '' } });
    const tryIt = tryButton(view);
    expect(tryIt.getAttribute('aria-disabled')).toBeNull();
    expect(view.queryByText('Add sample text to try this task.')).toBeNull();
    await fireEvent.click(tryIt);
    expect(view.getByText('Add sample text to try this task.')).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it('a task that cannot run yet says what it needs on click', async () => {
    const view = render(AnswerPreview, {
      draft,
      spec,
      s: parseSettings({}),
      problem: 'add a name',
    });
    await fireEvent.click(view.getByRole('button', { name: 'Example reply' }));
    await fireEvent.click(tryButton(view));
    expect(view.getByText('Add a name')).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('a real try', () => {
  it('shows the shared error copy and keeps the worker diagnostics behind Details', async () => {
    send.mockResolvedValueOnce({
      type: 'error',
      requestId: 'test',
      code: 'PARSE',
      message: 'HTTP 200: raw malformed JSON',
    });
    const view = await shown();
    await fireEvent.click(tryButton(view));
    await waitFor(() => expect(view.getByText('Wrong format')).toBeTruthy());
    expect(view.getByText(/did not answer in the format this task asks for/)).toBeTruthy();
    const diagnostics = view.getByText('HTTP 200: raw malformed JSON');
    expect(diagnostics.closest('details')?.open).toBe(false);
    await fireEvent.click(view.getByText('Details', { selector: 'summary' }));
    expect(tryButton(view)).toBeTruthy();
  });

  it('recovers from a failed test message without exposing a transport error', async () => {
    send.mockRejectedValueOnce(new Error('private transport failure'));
    const view = await shown();
    await fireEvent.click(tryButton(view));
    await waitFor(() => expect(view.getByText('No connection')).toBeTruthy());
    expect(view.queryByText('private transport failure')).toBeNull();
    expect(tryButton(view)).toBeTruthy();
  });

  it('shows example list items, then a real reply and its field check', async () => {
    send.mockResolvedValueOnce({
      type: 'done',
      requestId: 'test',
      text: 'Actual item',
      answer: { spec, fields: { outline: ['Actual item'] } },
    });
    const view = await shown();
    expect(view.getByText('Example item')).toBeTruthy();
    await fireEvent.click(tryButton(view));
    await waitFor(() => expect(view.getByText('Actual item')).toBeTruthy());
    expect(view.queryByText('Example values, not a real reply')).toBeNull();
    expect(view.getByText('All required fields came back')).toBeTruthy();
    expect(send.mock.calls[0]?.[0]).toMatchObject({ kind: 'task:try', draft });
    await view.rerender({ draft: { ...draft, label: 'Renamed' } });
    await waitFor(() => expect(view.queryByText('Actual item')).toBeNull());
    expect(view.getByText('Example item')).toBeTruthy();
  });

  it('an optional field left out is not "empty"; a required one is', async () => {
    const withNotes = customAnswerSpec({ output: 'card' });
    send.mockResolvedValueOnce({
      type: 'done',
      requestId: 'test',
      text: 'Hi',
      answer: { spec: withNotes, fields: { answer: 'Hi' } },
    });
    const view = await shown({ spec: withNotes });
    await fireEvent.click(tryButton(view));
    await waitFor(() => expect(view.getByText('All required fields came back')).toBeTruthy());
    expect(view.queryByText(/was empty/)).toBeNull();

    send.mockResolvedValueOnce({
      type: 'done',
      requestId: 'test',
      text: '',
      answer: { spec: withNotes, fields: { explain: 'n' } },
    });
    await fireEvent.click(tryButton(view));
    await waitFor(() => expect(view.getByText('Answer was empty')).toBeTruthy());
  });

  it('a required field named like a built-in object method is missing when it is left out', async () => {
    const own = customAnswerSpec({
      output: 'plain',
      answer: {
        v: 1,
        fields: [
          { key: 'answer', label: 'Answer', kind: 'text', role: 'main', required: true },
          { key: 'toString', label: 'To string', kind: 'text', role: 'notes', required: true },
        ],
      },
    });
    send.mockResolvedValueOnce({
      type: 'done',
      requestId: 'test',
      text: 'Hi',
      answer: { spec: own, fields: { answer: 'Hi' } },
    });
    const view = await shown({ spec: own });
    await fireEvent.click(tryButton(view));
    await waitFor(() => expect(view.getByText('To string was empty')).toBeTruthy());
  });

  it('shows raw HTML in a reply and its notes as text', async () => {
    send.mockResolvedValueOnce({
      type: 'done',
      requestId: 'test',
      text: '<h1>x</h1>',
      notes: [{ key: 'n', label: 'Note', text: '<h2>n</h2>' }],
    });
    const view = await shown();
    await fireEvent.click(tryButton(view));
    const card = view.container.querySelector('.ap-card') as HTMLElement;
    // The fallback <pre> shows the text raw, so wait for both Markdown passes to land.
    await waitFor(() => {
      expect(card.querySelectorAll('.ega-md')).toHaveLength(2);
      expect(card.querySelector('.ega-md-fallback')).toBeNull();
    });
    expect(card.querySelector('h1, h2')).toBeNull();
    expect(card.textContent).toContain('<h1>x</h1>');
    expect(card.textContent).toContain('<h2>n</h2>');
  });

  it('Stop is the same button, and cancels the run', async () => {
    send.mockImplementation(() => new Promise(() => {}));
    const view = await shown();
    await fireEvent.input(view.getByLabelText('Sample text'), { target: { value: 'My sample' } });
    const tryIt = tryButton(view);
    await fireEvent.click(tryIt);
    await waitFor(() => expect(view.getByRole('button', { name: 'Stop' })).toBe(tryIt));
    const request = send.mock.calls[0]?.[0];
    await fireEvent.click(view.getByRole('button', { name: 'Stop' }));
    expect(send.mock.calls[1]?.[0]).toMatchObject({
      kind: 'translate:cancel',
      requestId: request && 'requestId' in request ? request.requestId : '',
    });
    expect(view.getByText('Stopped')).toBeTruthy();
  });

  it('Stop still works after the sample is cleared during a run', async () => {
    send.mockImplementation(() => new Promise(() => {}));
    const view = await shown();
    const tryIt = tryButton(view);
    await fireEvent.click(tryIt);
    await waitFor(() => expect(view.getByRole('button', { name: 'Stop' })).toBe(tryIt));
    await fireEvent.input(view.getByLabelText('Sample text'), { target: { value: '' } });
    const stop = view.getByRole('button', { name: 'Stop' });
    expect(stop.getAttribute('aria-disabled')).toBeNull();
    const request = send.mock.calls[0]?.[0];
    await fireEvent.click(stop);
    expect(send.mock.calls[1]?.[0]).toMatchObject({
      kind: 'translate:cancel',
      requestId: request && 'requestId' in request ? request.requestId : '',
    });
  });
});
