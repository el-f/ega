<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { DEFAULT_BATCH_CONCURRENCY } from '@/shared/constants';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import RadioGroup from '@/shared/ui/RadioGroup.svelte';
  import Slider from '@/shared/ui/Slider.svelte';
  import Disclosure from '@/options/components/Disclosure.svelte';
  import { isFieldModified, settingHint } from '@/shared/settings-registry';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
  }

  const { s, onPatch }: Props = $props();
</script>

<SectionCard title="Page translate" description="Settings for translating a whole page">
  <div class="pt-mode" data-ega-setting="display.pageTranslateMode">
    <span class="pt-label" id="page-translate-mode-label">Show the translation</span>
    <RadioGroup
      value={s.pageTranslateMode}
      options={[
        { value: 'inplace', label: 'In place', description: 'Replaces the text of each block' },
        {
          value: 'bilingual',
          label: 'Under the original',
          description: 'Adds the translation under each block',
        },
      ]}
      dataAttrs={{ 'aria-labelledby': 'page-translate-mode-label' }}
      onValueChange={(v) =>
        void onPatch({ pageTranslateMode: v === 'bilingual' ? 'bilingual' : 'inplace' })}
    />
  </div>
  <Disclosure label="Batch settings">
    <div data-ega-setting="advanced.batchConcurrency">
      <Slider
        label="Areas sent at once"
        value={s.batchConcurrency ?? DEFAULT_BATCH_CONCURRENCY}
        min={1}
        max={10}
        step={1}
        defaultValue={DEFAULT_BATCH_CONCURRENCY}
        help={settingHint('advanced.batchConcurrency')}
        modified={isFieldModified('advanced.batchConcurrency', s)}
        onchange={(v) => void onPatch({ batchConcurrency: v })}
      />
    </div>
  </Disclosure>
</SectionCard>

<style>
  .pt-mode {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .pt-label {
    font-size: var(--fs-base);
    font-weight: 600;
  }
</style>
