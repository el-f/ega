<script lang="ts">
  import type { ErrCode } from '@/shared/types';
  import { errCodeLabel } from '@/shared/err-labels';
  import { optionsTabForMessage } from '@/shared/error-policy';
  import type { SettingsTab } from '@/shared/settings-tabs';
  import type { Task } from '@/shared/task-prompts';
  import { TASK_GERUND } from '@/shared/task-prompts';
  import { diffWords, type DiffOp } from '@/shared/diff-words';

  interface Props {
    /** Streaming / final translation body. Empty string means "nothing yet". */
    body: string;
    /** True while the request is in flight. Drives the shimmer pre-stream. */
    loading: boolean;
    /** Task drives the shimmer label ("Translating…" / "Explaining…" / …). */
    task: Task;
    /** Overrides the task gerund — the "?" Explain button re-runs translate
     *  with the explain flag, and its shimmer must still read "Explaining". */
    loadingLabel?: string;
    /** Optional culture/context sidebar text. */
    explain?: string;
    /** True when the explanation was grounded in an attached image —
     *  surfaces a "from image" marker beside the explain label. */
    usedImage?: boolean;
    /** Rendered alone, or as a note under a partial body. */
    error?: { code: ErrCode; message: string };
    /** Source image for image-translate results. When present, the image shows above the translated text. */
    imageUrl?: string;
    /** Opens the Options surface on the tab the error names. Used by the error-recovery CTA. */
    onOpenOptions?: (tab?: SettingsTab) => void;
    /** Prior body; once settled, a word diff shows for ~4s. Skipped when identical. */
    diffAgainst?: string;
    /** The diff renders only after the terminal frame, so streaming text stays plain. */
    settled?: boolean;
  }

  let {
    body,
    loading,
    task,
    loadingLabel,
    explain,
    usedImage,
    error,
    imageUrl,
    onOpenOptions,
    diffAgainst,
    settled,
  }: Props = $props();

  // Skip the diff on an error frame: that body has its own rendering and the diff spans fight its danger tone.
  const diffOps: DiffOp[] = $derived.by(() => {
    if (!settled || !diffAgainst || diffAgainst === body || error) return [];
    if (!body) return [];
    return diffWords(diffAgainst, body);
  });

  const showDiff = $derived(diffOps.length > 0);

  // With motion the diff spans fade to plain text after 4s; reduced-motion collapses that duration to 0 in CSS.
  let faded = $state(false);
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (!showDiff) {
      faded = false;
      if (fadeTimer) {
        clearTimeout(fadeTimer);
        fadeTimer = undefined;
      }
      return;
    }
    // Reset on each new diff (body re-settled with a different prior).
    faded = false;
    if (fadeTimer) clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      faded = true;
    }, 4000);
    return () => {
      if (fadeTimer) {
        clearTimeout(fadeTimer);
        fadeTimer = undefined;
      }
    };
  });

  // `loading` flips false on the first token, so announcing before `settled` repeats every token.
  const announcedBody = $derived(settled && !error ? body : '');
  const liveMessage = $derived(
    error ? `${errCodeLabel(error.code)}: ${error.message}` : announcedBody,
  );

  const optionsTab = $derived(error ? optionsTabForMessage(error.message, error.code) : undefined);
</script>

<span class="ega-sr-only" role="status" aria-live="polite" aria-atomic="true" data-ega-tooltip-live
  >{liveMessage}</span
>

{#if imageUrl && !error}
  <!-- No thumbnail on the error path: a half-loaded image rect reads as an artifact, not as a failure. -->
  <div class="tooltip-image-wrap" class:is-loading={loading}>
    <img
      class="tooltip-image-source"
      src={imageUrl}
      alt={loading ? 'Source image, being translated' : 'Source image for this translation'}
    />
    {#if loading}
      <span class="tooltip-image-shimmer" aria-hidden="true"></span>
      <span class="tooltip-image-caption">Reading text from image…</span>
    {/if}
  </div>
{/if}

{#if loading && !body && !error}
  <!-- A bare full-width shimmer reads as a stalled progress bar, so the pre-stream state carries a task label too. -->
  <div class="shimmer-wrap">
    <div class="shimmer" aria-hidden="true"></div>
    <span class="shimmer-label">{loadingLabel ?? TASK_GERUND[task]}…</span>
  </div>
{:else if error}
  {#if body}
    <!-- Keep whatever streamed in before the error, so the user can still read and copy it. -->
    <div class="body" dir="auto">{body}</div>
    <div class="src tooltip-error-line">
      {errCodeLabel(error.code)}: {error.message} (partial result above)
    </div>
  {:else}
    <!-- The danger token here, or an error body reads like a normal translation. -->
    <div class="body tooltip-error-body" dir="auto">
      {errCodeLabel(error.code)}: {error.message}
    </div>
  {/if}
  {#if optionsTab !== undefined && onOpenOptions}
    <button
      type="button"
      class="tooltip-error-cta"
      data-ega-tooltip-error-cta
      onclick={() => onOpenOptions?.(optionsTab)}
    >
      Open settings
    </button>
  {/if}
{:else}
  <div
    class="body"
    class:body-diff={showDiff}
    class:body-diff-faded={faded}
    dir="auto"
    aria-hidden={announcedBody !== ''}
  >
    {#if body}
      {#if showDiff}
        <!-- Keyed by index: ops are positional, and a kind+text key throws when one word changes twice. -->
        {#each diffOps as op, i (i)}
          {#if op.kind === 'eq'}<span class="diff-eq">{op.text}</span
            >{:else if op.kind === 'add'}<span class="diff-add" data-ega-diff="add">{op.text}</span
            >{:else}<span class="diff-del" data-ega-diff="del">{op.text}</span>{/if}
        {/each}
      {:else}
        {body}
      {/if}
    {:else if !loading}
      <span class="empty-body">
        No translation came back. Click Retry, or check the model in Settings → Backends.
      </span>
    {/if}
  </div>
  {#if explain}
    <div class="explain-block">
      <div class="explain-label">
        Context & subtext
        {#if usedImage}
          <span class="ega-from-image" title="Explained from the image">🖼 from image</span>
        {/if}
      </div>
      <div class="explain-body" dir="auto">{explain}</div>
    </div>
  {/if}
{/if}
