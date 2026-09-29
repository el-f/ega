<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { DEFAULT_BATCH_CONCURRENCY } from '@/shared/constants';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import Slider from '@/shared/ui/Slider.svelte';
  import { isFieldModified } from '@/shared/settings-registry';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
  }
  const { s, onPatch }: Props = $props();
</script>

<SectionCard title="Page translate" description="Settings for translating a whole page.">
  <div data-ega-setting="display.pageTranslateMode">
    <Select
      label="Render mode"
      value={s.pageTranslateMode}
      options={[
        { value: 'inplace', label: 'In place — replace the block text' },
        { value: 'bilingual', label: 'Bilingual — keep the original, add the translation below' },
      ]}
      modified={isFieldModified('display.pageTranslateMode', s)}
      onchange={(v) => void onPatch({ pageTranslateMode: v })}
    />
  </div>

  <details>
    <summary>Tune batch parameters</summary>

    <div class="batch-body">
      <div data-ega-setting="advanced.batchConcurrency">
        <Slider
          label="Concurrency"
          value={s.batchConcurrency ?? DEFAULT_BATCH_CONCURRENCY}
          min={1}
          max={10}
          step={1}
          help="How many parts of the page translate at the same time."
          modified={isFieldModified('advanced.batchConcurrency', s)}
          onchange={(v) => void onPatch({ batchConcurrency: v })}
        />
      </div>
    </div>
  </details>
</SectionCard>

<style>
  details {
    margin: 0;
  }
  summary {
    cursor: pointer;
    color: var(--color-muted);
    font-size: var(--fs-sm);
    padding: var(--space-1) 0;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::before {
    content: '▸';
    display: inline-block;
    margin-right: var(--space-1);
    transition: transform var(--motion-fast) var(--ease-out);
  }
  details[open] summary::before {
    transform: rotate(90deg);
  }
  .batch-body {
    display: flex;
    flex-direction: column;
    gap: var(--row-gap);
    padding-top: var(--space-2);
  }
</style>
