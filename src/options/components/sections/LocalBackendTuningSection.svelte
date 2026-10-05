<script lang="ts">
  import { DEFAULT_LOCAL_BACKEND_TIMEOUT_MS } from '@/shared/constants';
  import type { Settings } from '@/shared/types';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Slider from '@/shared/ui/Slider.svelte';

  interface Props {
    settings: Settings;
    /** Milliseconds, the stored unit; the slider shows seconds. */
    onChange: (next: number) => void;
  }

  let { settings, onChange }: Props = $props();
  // The thumb follows the drag locally; the write (which re-probes every backend) waits for release.
  let dragValue = $state<number | null>(null);
  // One decimal, so a 0.1 step never reads as 0.9000000000000001.
  const tenths = (x: number): number => Math.round(x * 10) / 10;
  const timeoutSeconds = $derived(
    tenths(
      dragValue ?? (settings.localBackendTimeoutMs ?? DEFAULT_LOCAL_BACKEND_TIMEOUT_MS) / 1000,
    ),
  );
</script>

<!-- Outside any dndzone, because a drag re-render inside BackendList unmounts the slider mid-drag. -->
<div data-testid="local-backend-timeout-slider" data-ega-setting="backends.localBackendTimeoutMs">
  <SectionCard
    title="Local-backend checks"
    description="How long Ega waits to hear back from a local backend before it moves on."
  >
    <Slider
      label="Check timeout"
      value={timeoutSeconds}
      min={0.5}
      max={5}
      step={0.1}
      unit=" s"
      help="Covers the native host, Ollama and a local server. Raise it if local requests often time out right after the computer wakes or the backend starts."
      onchange={(v) => (dragValue = v)}
      oncommit={(v) => {
        dragValue = null;
        onChange(Math.round(tenths(v) * 1000));
      }}
    />
  </SectionCard>
</div>
