<script lang="ts">
  import type { ErrCode } from '@/shared/types';
  import { errorTurnParts } from '@/shared/error-parts';
  import { optionsTabForMessage } from '@/shared/error-policy';
  import type { SettingsTab } from '@/shared/settings-tabs';
  import {
    taskCapabilities,
    SHIPPED_TASK_VIEWS,
    type TaskId,
    type TaskView,
  } from '@/shared/task-view';
  import { diffWords, type DiffOp } from '@/shared/diff-words';

  interface Props {
    /** Streaming / final translation body. Empty string means "nothing yet". */
    body: string;
    /** True while the request is in flight. Drives the shimmer pre-stream. */
    loading: boolean;
    stopped?: boolean;
    /** Task drives the shimmer label ("Translating…" / "Explaining…" / …). */
    task: TaskId;
    views?: readonly TaskView[];
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
    /** A failed image has no text to continue with, so this opens the side panel with the image waiting in its composer. */
    onOpenPanel?: () => void;
    /** Prior body; once settled, a word diff shows for ~4s. Skipped when identical. */
    diffAgainst?: string;
    /** The diff renders only after the terminal frame, so streaming text stays plain. */
    settled?: boolean;
    /** Tag of the language the answer is in; absent leaves the attribute out. */
    bodyLang?: string | undefined;
    /** Tag of the language the notes are in. */
    notesLang?: string | undefined;
    errorDetailsOpen?: boolean;
  }

  let {
    body,
    loading,
    stopped = false,
    task,
    views = SHIPPED_TASK_VIEWS,
    loadingLabel,
    explain,
    usedImage,
    error,
    imageUrl,
    onOpenOptions,
    onOpenPanel,
    diffAgainst,
    settled,
    bodyLang,
    notesLang,
    errorDetailsOpen = false,
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
  // The same split the side panel uses: a heading, the sentence that says what to do, and the provider's words behind Details.
  const errorParts = $derived(error ? errorTurnParts(error) : undefined);
  const liveMessage = $derived(
    stopped
      ? `Stopped. ${body || 'No answer yet.'}`
      : errorParts
        ? `${errorParts.title}. ${errorParts.body}`
        : announcedBody,
  );

  const optionsTab = $derived(error ? optionsTabForMessage(error.message, error.code) : undefined);
</script>

<span
  class="ega-sr-only"
  role="status"
  aria-live="polite"
  aria-atomic="true"
  data-ega-tooltip-live
  lang={error ? undefined : bodyLang}>{liveMessage}</span
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
    <span class="shimmer-label">{loadingLabel ?? taskCapabilities(task, views).gerund}…</span>
  </div>
{:else if error}
  {#if body}
    <!-- Keep whatever streamed in before the error, so the user can still read and copy it. -->
    <div class="body" dir="auto" lang={bodyLang}>{body}</div>
    <div class="src tooltip-error-line">
      {errorParts?.title}: {errorParts?.body} (partial result above)
    </div>
  {:else}
    <!-- The danger token here, or an error body reads like a normal translation. -->
    <div class="body tooltip-error-body" dir="auto">
      <strong class="tooltip-error-title">{errorParts?.title}</strong>
      {#if errorParts?.body}<span class="tooltip-error-text">{errorParts.body}</span>{/if}
    </div>
  {/if}
  {#if errorParts?.detail !== undefined && errorDetailsOpen}
    <pre class="tooltip-error-details">{errorParts.detail}</pre>
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
  {#if imageUrl && onOpenPanel}
    <button type="button" class="tooltip-error-cta tooltip-error-panel" onclick={onOpenPanel}>
      Open in side panel
    </button>
  {/if}
{:else}
  <div
    class="body"
    class:body-diff={showDiff}
    class:body-diff-faded={faded}
    dir="auto"
    lang={body ? bodyLang : undefined}
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
        {stopped
          ? 'No answer yet.'
          : 'No translation came back. Click Retry, or check the model in Settings → Backends.'}
      </span>
    {/if}
  </div>
  {#if explain}
    <div class="explain-block">
      <div class="explain-label">
        {taskCapabilities(task, views).notesLabel}
        {#if usedImage}
          <span class="ega-from-image" title="Explained from the image">🖼 from image</span>
        {/if}
      </div>
      <div class="explain-body" dir="auto" lang={notesLang}>{explain}</div>
    </div>
  {/if}
{/if}
