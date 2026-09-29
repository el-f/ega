// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import DescribeYourChange from '@/shared/components/DescribeYourChange.svelte';
import type { Rule } from '@/shared/rules';

describe('DescribeYourChange', () => {
  it('renders input with default placeholder + disabled Apply when empty', () => {
    const { container } = render(DescribeYourChange, {
      props: { task: 'translate', onRuleAdded: () => {} },
    });
    const input = container.querySelector<HTMLInputElement>('[data-ega-describe-input]');
    const button = container.querySelector<HTMLButtonElement>('[data-ega-describe-apply]');
    expect(input?.placeholder).toMatch(/Tell Ega what to do differently/);
    expect(button?.disabled).toBe(true);
  });

  it('falls back to manual rule when chrome.runtime.sendMessage rejects', async () => {
    const sendMessage = chrome.runtime.sendMessage as unknown as Mock;
    sendMessage.mockRejectedValue(new Error('no handler'));

    const onRuleAdded = vi.fn<(r: Rule) => void>();
    const { container } = render(DescribeYourChange, {
      props: {
        task: 'translate',
        host: 'twitter.com',
        onRuleAdded,
      },
    });

    const input = container.querySelector<HTMLInputElement>('[data-ega-describe-input]');
    const button = container.querySelector<HTMLButtonElement>('[data-ega-describe-apply]');
    if (!input || !button) throw new Error('expected input + button');

    await fireEvent.input(input, { target: { value: 'never invent words' } });
    await fireEvent.click(button);

    await waitFor(() => expect(onRuleAdded).toHaveBeenCalledTimes(1));
    const rule = onRuleAdded.mock.calls[0]?.[0] as Rule;
    expect(rule.body).toBe('never invent words');
    // detectCategory pattern: "never …" → 'never'
    expect(rule.category).toBe('never');
    expect(rule.scope.tasks).toEqual(['translate']);
    expect(rule.scope.sites).toEqual(['twitter.com']);
    expect(rule.source).toBe('describe');
    expect(rule.enabled).toBe(true);
    expect(typeof rule.id).toBe('string');
    expect(rule.id.length).toBeGreaterThan(0);
    // Background message was attempted with expected shape before fallback.
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'template:describe-change',
        input: 'never invent words',
        ctx: { task: 'translate', host: 'twitter.com' },
      }),
    );
    // Input cleared on success.
    expect(input.value).toBe('');
  });

  it('uses LLM response when sendMessage returns ok:true', async () => {
    const sendMessage = chrome.runtime.sendMessage as unknown as Mock;
    sendMessage.mockResolvedValue({
      ok: true,
      response: {
        category: 'prefer',
        body: 'Prefer short sentences over comma-spliced runs.',
        scope: { tasks: ['translate', 'reword'], sites: ['example.com'] },
      },
    });

    const onRuleAdded = vi.fn<(r: Rule) => void>();
    const { container } = render(DescribeYourChange, {
      props: {
        task: 'translate',
        onRuleAdded,
      },
    });
    const input = container.querySelector<HTMLInputElement>('[data-ega-describe-input]');
    const button = container.querySelector<HTMLButtonElement>('[data-ega-describe-apply]');
    if (!input || !button) throw new Error('expected input + button');

    await fireEvent.input(input, { target: { value: 'shorter sentences please' } });
    await fireEvent.click(button);

    await waitFor(() => expect(onRuleAdded).toHaveBeenCalledTimes(1));
    const rule = onRuleAdded.mock.calls[0]?.[0] as Rule;
    expect(rule.category).toBe('prefer');
    expect(rule.body).toBe('Prefer short sentences over comma-spliced runs.');
    expect(rule.scope.tasks).toEqual(['translate', 'reword']);
    expect(rule.scope.sites).toEqual(['example.com']);
    expect(rule.source).toBe('describe');
  });

  it('falls back when reply is { ok: false, reason }', async () => {
    const sendMessage = chrome.runtime.sendMessage as unknown as Mock;
    sendMessage.mockResolvedValue({ ok: false, reason: 'no-key' });

    const onRuleAdded = vi.fn<(r: Rule) => void>();
    const { container } = render(DescribeYourChange, {
      props: { task: 'global', onRuleAdded },
    });
    const input = container.querySelector<HTMLInputElement>('[data-ega-describe-input]');
    const button = container.querySelector<HTMLButtonElement>('[data-ega-describe-apply]');
    if (!input || !button) throw new Error('expected input + button');

    await fireEvent.input(input, { target: { value: 'always preserve URLs' } });
    await fireEvent.click(button);

    await waitFor(() => expect(onRuleAdded).toHaveBeenCalledTimes(1));
    const rule = onRuleAdded.mock.calls[0]?.[0] as Rule;
    // task === 'global' → empty tasks scope, no host → no sites.
    expect(rule.scope.tasks).toEqual([]);
    expect(rule.scope.sites).toBeUndefined();
    expect(rule.category).toBe('always');
  });

  it('submits on Enter without shift', async () => {
    const sendMessage = chrome.runtime.sendMessage as unknown as Mock;
    sendMessage.mockRejectedValue(new Error('no handler'));

    const onRuleAdded = vi.fn<(r: Rule) => void>();
    const { container } = render(DescribeYourChange, {
      props: { task: 'reword', onRuleAdded },
    });
    const input = container.querySelector<HTMLInputElement>('[data-ega-describe-input]');
    if (!input) throw new Error('expected input');
    await fireEvent.input(input, { target: { value: 'be casual' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onRuleAdded).toHaveBeenCalledTimes(1));
  });

  it('tears the shimmer down BEFORE pushing the danger toast on the error path', async () => {
    // Clear busy before pushing the toast, so the shimmer is gone when the toast slides in.
    const sendMessage = chrome.runtime.sendMessage as unknown as Mock;
    sendMessage.mockRejectedValue(new Error('no handler'));

    // Capture the DOM at toast-push time.
    const { toastStore } = await import('@/shared/components/toastStore');
    const captured: Array<{ shimmerVisible: boolean; variant: string }> = [];
    const realPush = toastStore.push.bind(toastStore);
    const pushSpy = vi.spyOn(toastStore, 'push').mockImplementation((entry) => {
      const shimmer = document.querySelector('.busy-shimmer');
      captured.push({ shimmerVisible: shimmer !== null, variant: entry.variant ?? 'default' });
      return realPush(entry);
    });

    const onRuleAdded = vi.fn<(r: Rule) => Promise<void>>(() =>
      Promise.reject(new Error('storage exploded')),
    );
    const { container } = render(DescribeYourChange, {
      props: { task: 'translate', onRuleAdded },
    });
    const input = container.querySelector<HTMLInputElement>('[data-ega-describe-input]');
    const button = container.querySelector<HTMLButtonElement>('[data-ega-describe-apply]');
    if (!input || !button) throw new Error('expected input + button');

    await fireEvent.input(input, { target: { value: 'never abbreviate' } });
    await fireEvent.click(button);

    await waitFor(() => expect(pushSpy).toHaveBeenCalled());
    expect(captured).toHaveLength(1);
    expect(captured[0]?.variant).toBe('danger');
    expect(captured[0]?.shimmerVisible).toBe(false);
    pushSpy.mockRestore();
  });
});
