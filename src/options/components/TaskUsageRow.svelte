<script lang="ts">
  /** "Sent with: Translate, Explain [Change]": which tasks use a card's setting, read-only, with a way to the Tasks tab. */
  import Button from '@/shared/ui/Button.svelte';
  import { gotoOptionsTab } from '@/options/deep-link';

  interface Props {
    label: string;
    /** Task names in task order; the line shows `emptyText` when there are none. */
    names: readonly string[];
    emptyText: string;
    /** The Change button's full name, starting with "Change", e.g. "Change which tasks send page context". */
    changeName: string;
    /** The Tasks tab entry Change lands on; the tab top when absent. */
    target?: string;
  }

  const { label, names, emptyText, changeName, target }: Props = $props();
</script>

<div class="usage-row" data-ega-task-usage>
  <span class="usage-label">{label}</span>
  <span class="usage-value">{names.length > 0 ? names.join(', ') : emptyText}</span>
  <Button variant="ghost" ariaLabel={changeName} onclick={() => gotoOptionsTab('tasks', target)}
    >Change</Button
  >
</div>

<style>
  .usage-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    min-height: 32px;
    font-size: var(--fs-base);
  }
  .usage-label {
    font-weight: 600;
  }
  .usage-value {
    flex: 1 1 12rem;
    color: var(--color-fg);
  }
</style>
