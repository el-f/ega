<script lang="ts">
  /** Reset and delete: one row per action, its effect in one line, and the button at the end. */
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Button from '@/shared/ui/Button.svelte';

  interface Props {
    onReset: () => Promise<void>;
    onClearCache: () => Promise<void>;
    onDeleteAll: () => void;
  }

  const { onReset, onClearCache, onDeleteAll }: Props = $props();
</script>

<div data-ega-setting="advanced.resetEverything">
  <SectionCard
    title="Reset and delete"
    info={{
      label: 'About resets',
      text: 'Language prompts, API keys, tasks and saved conversations are kept. Delete all data cannot be undone.',
    }}
  >
    <ul class="rd-list">
      <li class="rd-row">
        <div class="rd-text">
          <span class="rd-label">Reset prompt and model settings</span>
          <span class="rd-line" id="rd-reset-line"
            >Puts back the Translate prompt, Effort, creativity and answer length</span
          >
        </div>
        <Button
          variant="secondary"
          describedBy="rd-reset-line"
          dataAttrs={{ 'data-ega-reset-defaults': true }}
          onclick={() => void onReset()}>Reset</Button
        >
      </li>
      <li class="rd-row" data-ega-setting="about.clearCache">
        <div class="rd-text">
          <span class="rd-label">Clear saved answers</span>
          <span class="rd-line" id="rd-cache-line">Translations run again next time</span>
        </div>
        <Button
          variant="secondary"
          describedBy="rd-cache-line"
          dataAttrs={{ 'data-ega-clear-cache': true }}
          onclick={() => void onClearCache()}>Clear cache</Button
        >
      </li>
      <li class="rd-row" data-ega-setting="about.deleteAllData">
        <div class="rd-text">
          <span class="rd-label">Delete all data</span>
          <span class="rd-line" id="rd-delete-line"
            >Removes every setting, key and saved conversation</span
          >
        </div>
        <Button
          variant="danger"
          describedBy="rd-delete-line"
          dataAttrs={{ 'data-ega-delete-all': true }}
          onclick={onDeleteAll}>Delete all data</Button
        >
      </li>
    </ul>
  </SectionCard>
</div>

<style>
  .rd-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .rd-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-4);
    padding-block: var(--space-2);
  }
  .rd-row + .rd-row {
    border-top: 1px solid var(--color-border-subtle);
  }
  .rd-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1 1 18rem;
    min-width: 0;
  }
  .rd-label {
    font-size: var(--fs-base);
    font-weight: 500;
  }
  .rd-line {
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
</style>
