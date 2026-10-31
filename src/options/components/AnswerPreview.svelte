<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { AnswerSpec } from '@/shared/answer/spec';
  import { readAnswer } from '@/shared/answer/reader';
  import { mainAnswerItems, soleFencedCode } from '@/shared/answer-presentation';
  import type { TranslationChunk, Settings } from '@/shared/types';
  import type { CustomTaskInput } from '@/shared/tasks';
  import { sendMsg } from '@/shared/messages';
  import { uuid } from '@/shared/uuid';
  import { errorCopy } from '@/shared/error-copy';
  import { computeBackendOrder } from '@/shared/backends/select';
  import { getRegisteredBackendIds } from '@/shared/backends/registry';
  import { backendHasRequiredKey, backendNeedsKey } from '@/shared/backends/key-presence';
  import { backendLabel } from '@/shared/backends/provider-profiles';
  import { PREVIEW_SAMPLE_TEXT } from '@/options/preview-prompt';
  import AnswerNotes from '@/shared/components/AnswerNotes.svelte';
  import ReplyDetails from '@/shared/components/ReplyDetails.svelte';
  import Markdown from '@/shared/components/Markdown.svelte';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Button from '@/shared/ui/Button.svelte';
  import Input from '@/shared/ui/Input.svelte';

  interface Props {
    spec: AnswerSpec;
    draft: CustomTaskInput;
    s: Settings;
    problem?: string | null;
    /** The saved row's id, so Try applies the task's rules as Preview does; null before the first save. */
    taskId?: string | null;
  }
  let { spec, draft, s, problem = null, taskId = null }: Props = $props();
  let open = $state(false);
  let text = $state(PREVIEW_SAMPLE_TEXT);
  let runningId = $state<string | null>(null);
  let terminal = $state<Extract<TranslationChunk, { type: 'done' | 'error' }> | null>(null);
  let detailsOpen = $state(false);
  const reason = $derived.by(() => {
    const need = problem ?? (!text.trim() ? 'Add sample text to try this task.' : null);
    return need === null ? null : need[0]?.toUpperCase() + need.slice(1);
  });
  // Shown only after a click (Try is never disabled, R37), and gone once the reason changes or goes.
  let asked = $derived.by(() => {
    void reason;
    return false;
  });
  const why = $derived(asked ? (reason ?? '') : '');
  $effect(() => {
    JSON.stringify(draft);
    untrack(() => {
      if (runningId === null) {
        terminal = null;
        detailsOpen = false;
      }
    });
  });
  const uid = $props.id();
  // A cloud row with a key answers first; a local row above it may too, and only a probe can tell, so it goes unnamed.
  const firstBackend = $derived.by(() => {
    for (const id of computeBackendOrder(s, getRegisteredBackendIds())) {
      if (!backendNeedsKey(id)) return null;
      if (backendHasRequiredKey(id, s)) return backendLabel(id);
    }
    return null;
  });
  const tryLabel = $derived(firstBackend === null ? 'Try it' : `Try with ${firstBackend}`);
  const previewError = $derived(
    terminal?.type === 'error' ? errorCopy(terminal.code, terminal.message) : null,
  );
  const sample = $derived.by(() => {
    const values = Object.fromEntries(
      spec.fields.map((field) => [
        field.key,
        field.kind === 'list'
          ? ['Example item', 'Another example item']
          : field.kind === 'score'
            ? 0.85
            : field.kind === 'yesno'
              ? true
              : field.kind === 'choice'
                ? (field.choices?.[0] ?? 'Example choice')
                : field.kind === 'languages'
                  ? [{ id: 'en' }]
                  : field.kind === 'language'
                    ? 'en'
                    : field.role === 'main'
                      ? 'Example answer'
                      : `Example ${field.label.toLowerCase()}`,
      ]),
    );
    return readAnswer(spec, JSON.stringify(values));
  });
  const shown = $derived(
    terminal?.type === 'done'
      ? {
          text: terminal.text ?? '',
          notes: terminal.notes ?? [],
          answer: terminal.answer,
        }
      : sample.kind === 'ok'
        ? { text: sample.main, notes: sample.notes, answer: { spec, fields: sample.fields } }
        : { text: '', notes: [], answer: undefined },
  );
  const items = $derived(mainAnswerItems(shown.answer));
  // Plain text, as the panel shows a custom answer; one fenced block still shows as code there.
  const plainMain = $derived(soleFencedCode(shown.text, true) === null);
  const checkLine = $derived.by(() => {
    if (terminal?.type !== 'done') return '';
    const issues = terminal.meta?.answerFormat?.issues;
    if (issues?.length) return issues[0] ?? '';
    const answer = terminal.answer;
    // A field the model may leave out is not missing when it is left out.
    const missing = answer?.spec.fields.find(
      (f) => f.required && f.when === undefined && !Object.hasOwn(answer.fields, f.key),
    );
    return missing ? `${missing.label} was empty` : 'All required fields came back';
  });
  async function run(): Promise<void> {
    if (runningId !== null) return;
    asked = true;
    if (reason !== null) return;
    const requestId = uuid();
    runningId = requestId;
    terminal = null;
    detailsOpen = false;
    try {
      const result = await sendMsg({
        kind: 'task:try',
        requestId,
        text,
        draft,
        ...(taskId !== null ? { taskId } : {}),
        sourceLang: 'auto',
        targetLang: s.defaultTargetLang,
      });
      if (runningId !== requestId) return;
      terminal = result ?? {
        type: 'error',
        requestId,
        code: 'UNKNOWN',
        message: 'Ega could not finish this test. Try again.',
      };
    } catch {
      if (runningId === requestId)
        terminal = {
          type: 'error',
          requestId,
          code: 'NETWORK',
          message: 'Ega could not send this test. Try again.',
        };
    } finally {
      if (runningId === requestId) runningId = null;
    }
  }
  function stop(): void {
    const id = runningId;
    if (id === null) return;
    runningId = null;
    void sendMsg({ kind: 'translate:cancel', requestId: id });
    terminal = { type: 'error', requestId: id, code: 'ABORTED', message: 'Stopped' };
  }
  onDestroy(() => {
    if (runningId !== null) void sendMsg({ kind: 'translate:cancel', requestId: runningId });
  });
</script>

<div class="ap-preview" data-ega-answer-preview>
  <div>
    <Button
      variant="ghost"
      size="sm"
      leadingIcon={open ? ChevronDown : ChevronRight}
      dataAttrs={{
        'aria-expanded': open ? 'true' : 'false',
        'aria-controls': open ? `${uid}-body` : undefined,
        'data-ega-example-reply': true,
      }}
      onclick={() => (open = !open)}>Example reply</Button
    >
  </div>
  {#if open}
    <div class="ap-body" id="{uid}-body">
      {#if terminal === null && runningId === null}
        <p class="ap-hint">Example values, not a real reply</p>
      {/if}
      <div class="ap-card" aria-busy={runningId !== null}>
        {#if runningId !== null}<p role="status">
            Trying your task…
          </p>{:else if terminal?.type === 'error'}
          {#if previewError}
            <p role="status"><strong>{previewError.title}</strong>: {previewError.body}</p>
            {#if previewError.detail}<details>
                <summary>Details</summary>
                <pre>{previewError.detail}</pre>
              </details>{/if}
          {:else}<p role="status">Stopped</p>{/if}
        {:else}
          <div class="ap-answer" dir="auto" data-ega-preview-answer>
            {#if items}<ul>
                {#each items as item, i (i)}<li>{item}</li>{/each}
              </ul>{:else if plainMain}<span class="ap-plain">{shown.text}</span>{:else}<Markdown
                text={shown.text}
              />{/if}
          </div>
          <!-- A custom task's fields are plain strings, shown as the panel and the tooltip show them. -->
          <AnswerNotes notes={shown.notes}
            >{#snippet renderText(text: string)}<div class="ap-note" dir="auto">
                {text}
              </div>{/snippet}</AnswerNotes
          >
          {#if checkLine}<p class="ap-check" role="status">{checkLine}</p>{/if}
        {/if}
        {#if terminal?.type === 'done'}
          <Button
            variant="ghost"
            size="sm"
            onclick={() => {
              detailsOpen = !detailsOpen;
            }}>About this reply</Button
          >
          {#if detailsOpen}<ReplyDetails
              meta={terminal.meta}
              answer={terminal.answer}
              details={terminal.details}
              sentText={text}
              taskLabel={draft.label || 'Your task'}
              surface="panel"
              onClose={() => {
                detailsOpen = false;
              }}
            />{/if}
        {/if}
      </div>
      <Input label="Sample text" bind:value={text} maxlength={2000} />
      <p class="ap-hint ap-why" role="status" id="{uid}-why">{runningId === null ? why : ''}</p>
      <!-- One button for Try and Stop, so focus stays on it and its width holds (R63). -->
      <Button
        variant="secondary"
        labels={[tryLabel, 'Stop']}
        {...why && runningId === null ? { describedBy: `${uid}-why` } : {}}
        onclick={() => (runningId !== null ? stop() : void run())}
        >{runningId !== null ? 'Stop' : tryLabel}</Button
      >
    </div>
  {/if}
</div>

<style>
  .ap-preview,
  .ap-body {
    display: grid;
    gap: var(--space-2);
  }
  .ap-hint {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .ap-why:empty {
    display: none;
  }
  .ap-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    overflow-wrap: anywhere;
    min-inline-size: 0;
  }
  .ap-plain {
    white-space: pre-wrap;
  }
  .ap-card ul {
    margin: 0;
    padding-inline-start: var(--space-5);
  }
  summary {
    cursor: pointer;
    min-block-size: 32px;
    padding-block: var(--space-1);
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
  }
  /* The side panel's notes size, line height and color. */
  .ap-note {
    font-size: var(--fs-md);
    line-height: var(--lh-body);
    color: var(--color-fg);
  }
  .ap-check {
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .ap-body > :global(.ega-btn) {
    justify-self: start;
  }
</style>
