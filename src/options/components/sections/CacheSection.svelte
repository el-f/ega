<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { isFieldModified } from '@/shared/settings-registry';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
  }
  const { s, onPatch }: Props = $props();
</script>

<SectionCard
  title="Cache"
  description="Reuse recent translations for up to 5 minutes (up to 500 entries)."
>
  <div data-ega-setting="advanced.cacheEnabled" data-ega-cache-card>
    <Checkbox
      id="cache-enabled-toggle"
      label="Reuse recent translations"
      checked={s.cacheEnabled}
      modified={isFieldModified('advanced.cacheSettings', s)}
      onchange={(next) => void onPatch({ cacheEnabled: next })}
    />
    <p class="setting-help">
      The cache lives in memory only, so it clears when Chrome stops Ega's background worker, for
      example when Ega is idle or the browser restarts.
    </p>
  </div>
</SectionCard>

<style>
  .setting-help {
    margin: 2px 0 0 var(--space-5);
    font-size: var(--fs-xs);
    color: var(--color-muted);
    line-height: var(--lh-body);
  }
</style>
