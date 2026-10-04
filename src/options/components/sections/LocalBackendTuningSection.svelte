<script lang="ts">
  import { DEFAULT_LOCAL_BACKEND_TIMEOUT_MS } from '@/shared/constants';
  import type { Settings } from '@/shared/types';
  import Slider from '@/shared/ui/Slider.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';

  interface Props {
    settings: Settings;
    onChange: (next: number) => void;
    onTogglePreWarm?: (next: boolean) => void;
  }

  let { settings, onChange, onTogglePreWarm }: Props = $props();
  const preWarmOn = $derived(settings.preWarmNative !== false);
  // The thumb follows the drag locally; the write (which re-probes every backend) waits for release.
  let dragValue = $state<number | null>(null);
  const timeoutValue = $derived(
    dragValue ?? settings.localBackendTimeoutMs ?? DEFAULT_LOCAL_BACKEND_TIMEOUT_MS,
  );
</script>

<!-- Outside any dndzone, because a drag re-render inside BackendList unmounts the slider mid-drag. -->
<section class="local-tuning" data-testid="local-backend-timeout-slider">
  <h2 class="local-tuning-title">Local-backend checks</h2>
  <p class="local-tuning-help">
    How long Ega waits when checking that a local backend (native host, Ollama or a local server) is
    reachable. Raise it if local requests often time out right after the computer wakes or the
    backend starts.
  </p>
  <Slider
    label="Check timeout"
    value={timeoutValue}
    min={500}
    max={5000}
    step={50}
    unit=" ms"
    onchange={(v) => (dragValue = v)}
    oncommit={(v) => {
      dragValue = null;
      onChange(v);
    }}
  />
  {#if onTogglePreWarm}
    <div class="prewarm-row" data-testid="prewarm-native-toggle">
      <Checkbox
        checked={preWarmOn}
        size="sm"
        label="Start the native CLI with the browser"
        onchange={onTogglePreWarm}
        inputAttrs={{
          'data-ega-setting': 'backends.preWarmNative',
          'aria-describedby': 'ega-prewarm-hint',
        }}
      />
      <span class="prewarm-hint" id="ega-prewarm-hint">
        Starts the claude CLI when the browser starts, so the first translation skips a 7-12 s
        warm-up. The codex CLI runs one process per translation, so it does not start early. Off
        saves battery on machines that rarely translate.
      </span>
    </div>
  {/if}
</section>

<style>
  .local-tuning {
    margin-top: var(--space-4);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
  }
  .local-tuning-title {
    margin: 0 0 var(--space-1);
    font-size: var(--fs-md);
    font-weight: 600;
    color: var(--color-fg);
  }
  .local-tuning-help {
    margin: 0 0 var(--space-2);
    font-size: var(--fs-xs);
    color: var(--color-muted);
    line-height: 1.45;
  }
  .prewarm-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: var(--space-3);
  }
  /* Lines the hint up under the label text: the box is 14px, then the checkbox gap. */
  .prewarm-hint {
    padding-inline-start: calc(14px + var(--space-2));
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    line-height: 1.45;
  }
</style>
