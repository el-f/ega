<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { AnswerSpec } from '@/shared/answer/spec';
  import { readAnswer } from '@/shared/answer/reader';
  import { mainAnswerItems } from '@/shared/answer-presentation';
  import type { TranslationChunk, Settings } from '@/shared/types';
  import type { CustomTaskInput } from '@/shared/tasks';
  import { sendMsg } from '@/shared/messages';
  import { uuid } from '@/shared/uuid';
  import { errorCopy } from '@/shared/error-copy';
  import { PREVIEW_SAMPLE_TEXT } from '@/options/preview-prompt';
  import AnswerNotes from '@/shared/components/AnswerNotes.svelte';
  import ReplyDetails from '@/shared/components/ReplyDetails.svelte';
  import Markdown from '@/shared/components/Markdown.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import Input from '@/shared/ui/Input.svelte';

  interface Props {
    spec: AnswerSpec;
    draft: CustomTaskInput;
    s: Settings;
    problem?: string | null;
  }
  let { spec, draft, s, problem = null }: Props = $props();
  let text = $state(PREVIEW_SAMPLE_TEXT);
  let runningId = $state<string | null>(null);
  let terminal = $state<Extract<TranslationChunk, { type: 'done' | 'error' }> | null>(null);
  let detailsOpen = $state(false);
  const disabledReason = $derived(
    problem ?? (!text.trim() ? 'Add sample text to try this task.' : null),
  );
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
  const previewError = $derived(
    terminal?.type === 'error' ? errorCopy(terminal.code, terminal.message) : null,
  );
  const sample = $derived.by(() => {
    const values = Object.fromEntries(
      spec.fields.map((field) => [
        field.key,
        field.kind === 'list'
          ? ['First sample item', 'Second sample item']
          : field.kind === 'score'
            ? 0.85
            : field.kind === 'yesno'
              ? true
              : field.kind === 'choice'
                ? (field.choices?.[0] ?? 'Sample choice')
                : field.kind === 'languages'
                  ? [{ id: 'en' }]
                  : field.kind === 'language'
                    ? 'en'
                    : field.role === 'main'
                      ? 'Your answer appears here'
                      : `Sample ${field.label.toLowerCase()}`,
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
  const checkLine = $derived.by(() => {
    if (terminal?.type !== 'done') return '';
    const issues = terminal.meta?.answerFormat?.issues;
    if (issues?.length) return issues[0] ?? '';
    const answer = terminal.answer;
    const missing = answer?.spec.fields.find((f) => answer.fields[f.key] === undefined);
    return missing ? `${missing.label} was empty` : 'All fields came back';
  });
  async function run(): Promise<void> {
    if (problem || !text.trim() || runningId !== null) return;
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

<section class="ap-preview" aria-labelledby="{uid}-title" data-ega-answer-preview>
  <h3 id="{uid}-title">Answer preview</h3>
  <p class="ap-hint">Sample values update as you edit. Try it sends your sample to a backend.</p>
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
      {#if items}<ul>
          {#each items as item, i (i)}<li>{item}</li>{/each}
        </ul>{:else}<Markdown text={shown.text} />{/if}
      <AnswerNotes notes={shown.notes}
        >{#snippet renderText(text: string)}<Markdown {text} />{/snippet}</AnswerNotes
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
  {#if disabledReason}<p id="{uid}-problem" class="ap-hint" data-ega-disabled-reason>
      {disabledReason}
    </p>{/if}
  {#if runningId !== null}<Button variant="secondary" onclick={stop}>Stop</Button>{:else}
    <Button
      variant="secondary"
      ariaDisabled={disabledReason !== null}
      {...disabledReason !== null ? { describedBy: `${uid}-problem` } : {}}
      onclick={() => void run()}>Try it</Button
    >
  {/if}
</section>

<style>
  .ap-preview {
    display: grid;
    gap: var(--space-2);
  }
  h3 {
    margin: 0;
    font-size: var(--fs-base);
    font-weight: 600;
  }
  .ap-hint {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .ap-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    overflow-wrap: anywhere;
    min-inline-size: 0;
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
  .ap-check {
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .ap-preview > :global(.ega-btn) {
    justify-self: start;
  }
</style>
