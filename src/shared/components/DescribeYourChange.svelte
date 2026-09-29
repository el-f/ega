<script lang="ts">
  import type { Task } from '@/shared/task-prompts';
  import type { Rule } from '@/shared/rules';
  import {
    fallbackDescribeChange,
    describeResponseToRule,
    type DescribeChangeResponse,
  } from '@/shared/template-rewrite';
  import { tick } from 'svelte';
  import { sendMsg } from '@/shared/messages';
  import { toastStore } from '@/shared/components/toastStore';
  import LoadingState from '@/shared/components/LoadingState.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import Input from '@/shared/ui/Input.svelte';

  interface DescribeChangeOk {
    ok: true;
    response: DescribeChangeResponse;
  }

  function isOkReply(reply: unknown): reply is DescribeChangeOk {
    if (reply == null || typeof reply !== 'object') return false;
    const r = reply as { ok?: unknown; response?: unknown };
    if (r.ok !== true || r.response == null || typeof r.response !== 'object') return false;
    const resp = r.response as { category?: unknown; body?: unknown; scope?: unknown };
    if (typeof resp.body !== 'string' || resp.body.trim().length === 0) return false;
    if (
      resp.category !== 'always' &&
      resp.category !== 'never' &&
      resp.category !== 'prefer' &&
      resp.category !== 'format' &&
      resp.category !== 'unknown'
    ) {
      return false;
    }
    return resp.scope != null && typeof resp.scope === 'object';
  }

  interface Props {
    task: Task | 'global';
    host?: string;
    onRuleAdded: (rule: Rule) => void | Promise<void>;
    onNewRuleId?: (id: string) => void;
    placeholder?: string;
  }

  const {
    task,
    host,
    onRuleAdded,
    onNewRuleId,
    placeholder = 'Tell Ega what to do differently…',
  }: Props = $props();

  let input = $state('');
  let busy = $state(false);

  function ctx(): { task: Task | 'global'; host?: string } {
    return host ? { task, host } : { task };
  }

  async function apply(): Promise<void> {
    const text = input.trim();
    if (text.length === 0 || busy) return;
    busy = true;
    let usedFallback = false;
    let rule: Rule;
    try {
      const reply = await sendMsg({
        kind: 'template:describe-change',
        input: text,
        ctx: ctx(),
      });
      if (isOkReply(reply)) {
        rule = describeResponseToRule(reply.response, 'describe');
      } else {
        usedFallback = true;
        rule = describeResponseToRule(fallbackDescribeChange(text, ctx()), 'describe');
      }
    } catch {
      usedFallback = true;
      rule = describeResponseToRule(fallbackDescribeChange(text, ctx()), 'describe');
    }
    try {
      await onRuleAdded(rule);
      onNewRuleId?.(rule.id);
      input = '';
      if (usedFallback) {
        toastStore.push({
          message: 'Saved your text as a rule. The model could not rewrite it.',
          variant: 'warning',
        });
      } else {
        toastStore.push({ message: 'Rule added.', variant: 'success' });
      }
      busy = false;
    } catch {
      // $state flushes async, so tick() lets the shimmer unmount before the toast slides in.
      busy = false;
      await tick();
      toastStore.push({ message: 'Could not save rule.', variant: 'danger' });
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void apply();
    }
  }
</script>

<div class="describe-your-change" data-ega-describe-your-change>
  <div class="row">
    <span class="ega-sr-only" id="describe-your-change-label">Describe a change</span>
    <div class="grow">
      <Input
        bind:value={input}
        onkeydown={onKeydown}
        {placeholder}
        disabled={busy}
        dataAttrs={{
          'data-ega-describe-input': 'true',
          'aria-labelledby': 'describe-your-change-label',
          'aria-label': "Describe a change to Ega's prompt behaviour",
        }}
      />
    </div>
    <Button
      variant="primary"
      loading={busy}
      disabled={input.trim().length === 0}
      title={input.trim().length === 0 ? 'Type a change to enable' : 'Send to your model'}
      dataAttrs={{
        'data-ega-describe-apply': 'true',
      }}
      onclick={() => void apply()}
    >
      Apply
    </Button>
  </div>
  {#if busy}
    <div class="busy" role="status" aria-live="polite">
      <span class="busy-label">Asking your model…</span>
      <div class="busy-shimmer" aria-hidden="true">
        <LoadingState rows={1} label="Asking your model…" />
      </div>
    </div>
  {/if}
</div>

<style>
  .describe-your-change {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: var(--space-2) 0;
  }
  .row {
    display: flex;
    gap: var(--space-2);
    align-items: stretch;
  }
  .grow {
    flex: 1 1 auto;
    min-width: 0;
  }
  .busy {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 14px;
  }
  .busy-label {
    font-size: var(--fs-sm);
    color: var(--color-fg-subtle);
  }
  .busy-shimmer {
    flex: 1 1 auto;
    min-width: 0;
  }
</style>
