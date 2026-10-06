<script lang="ts">
  import Button from '@/shared/ui/Button.svelte';
  import Icon from '@/shared/ui/Icon.svelte';
  import Languages from '@lucide/svelte/icons/languages';
  import MessageCircleQuestion from '@lucide/svelte/icons/message-circle-question';
  import FileText from '@lucide/svelte/icons/file-text';
  import type { SuggestionKind, SuggestionResult } from '../state/thread-view';

  interface Props {
    /** False when no backend is ready; null while the check runs, which shows the normal state. */
    backendReady: boolean | null;
    /** Absent: the line shows without the suggestion buttons. */
    onSuggestion?: ((kind: SuggestionKind) => Promise<SuggestionResult>) | undefined;
    onSetUpBackend: () => void;
  }

  const { backendReady, onSuggestion, onSetUpBackend }: Props = $props();

  let status = $state('');

  const STATUS: Record<Exclude<SuggestionResult, 'sent'>, string> = {
    'no-selection': 'Select some text on the page first.',
    unreadable: "Ega can't read this tab.",
    page: 'Translating the page in the tab',
  };

  async function run(kind: SuggestionKind): Promise<void> {
    if (!onSuggestion) return;
    const result = await onSuggestion(kind);
    status = result === 'sent' ? '' : STATUS[result];
  }

  const SUGGESTIONS = [
    { kind: 'translate-selection', label: 'Translate selection', icon: Languages },
    { kind: 'explain-selection', label: 'Explain selection', icon: MessageCircleQuestion },
    { kind: 'translate-page', label: 'Translate this page', icon: FileText },
  ] as const;
</script>

<div class="ega-empty" data-ega-sidepanel-empty>
  <span class="ega-empty-icon" aria-hidden="true"><Icon icon={Languages} size={24} /></span>
  {#if backendReady === false}
    <p class="ega-empty-line">Set up a backend to start</p>
    <p class="ega-empty-sub">Add an API key, or connect Ollama or Claude Code.</p>
    <Button variant="primary" size="sm" onclick={onSetUpBackend}>Set up a backend</Button>
  {:else}
    <p class="ega-empty-line">Translate or explain text on this page</p>
    {#if onSuggestion}
      <div class="ega-empty-actions">
        {#each SUGGESTIONS as s (s.kind)}
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={s.icon}
            dataAttrs={{ 'data-ega-suggestion': s.kind }}
            onclick={() => void run(s.kind)}>{s.label}</Button
          >
        {/each}
      </div>
      <p class="ega-empty-status" role="status">{status}</p>
    {/if}
  {/if}
</div>

<style>
  .ega-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    text-align: center;
    max-inline-size: 320px;
    margin-inline: auto;
  }
  .ega-empty-icon {
    display: inline-flex;
    color: var(--color-muted);
  }
  .ega-empty-line {
    margin: 0;
    font-size: var(--fs-md);
    line-height: var(--lh-body);
    color: var(--color-fg);
  }
  .ega-empty-sub {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
  .ega-empty-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    inline-size: min(280px, 100%);
    margin-block-start: var(--space-2);
  }
  .ega-empty-actions :global(.ega-btn) {
    justify-content: flex-start;
    inline-size: 100%;
  }
  .ega-empty-status {
    margin: 0;
    min-block-size: calc(var(--fs-sm) * var(--lh-body));
    font-size: var(--fs-sm);
    color: var(--color-muted);
  }
</style>
