<script lang="ts">
  import {
    DEFAULT_IMAGE_TRANSLATE_TIMEOUT_MS,
    DEFAULT_LOCAL_BACKEND_TIMEOUT_MS,
    DEFAULT_TRANSLATE_TIMEOUT_MS,
  } from '@/shared/constants';
  import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
  import { isFieldModified, settingHint } from '@/shared/settings-registry';
  import type { Settings } from '@/shared/types';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Slider from '@/shared/ui/Slider.svelte';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<unknown> | void;
  }

  const { s, onPatch }: Props = $props();

  // One decimal, so a 0.1 step never reads as 0.9000000000000001.
  const tenths = (x: number): number => Math.round(x * 10) / 10;
  const seconds = (v: number): string => `${v} s`;
  // A write re-probes the backends, so it waits for release; the released value stays until the write settles, or a quick second press starts from the old one.
  function hold(v: number, write: Promise<unknown> | void, clear: (v: number) => void): void {
    void Promise.resolve(write).finally(() => clear(v));
  }
  let localDrag = $state<number | null>(null);
  let ttlDrag = $state<number | null>(null);
  let textDrag = $state<number | null>(null);
  let imageDrag = $state<number | null>(null);
  const localSeconds = $derived(
    tenths(localDrag ?? (s.localBackendTimeoutMs ?? DEFAULT_LOCAL_BACKEND_TIMEOUT_MS) / 1000),
  );
</script>

<!-- Outside any dndzone, because a drag re-render inside the backend lists unmounts a slider mid-drag. -->
<div data-testid="local-backend-timeout-slider">
  <SectionCard
    title="Timeouts and checks"
    description="How long Ega waits before it moves on"
    groups
    info={{
      label: 'About timeouts',
      text: 'A request that passes its timeout moves to the next ready backend. Local checks run before Ega uses Ollama, a local server or the native host.',
    }}
  >
    <div data-ega-setting="advanced.translateTimeoutMs">
      <Slider
        label="Text answer timeout"
        value={textDrag ??
          Math.round((s.translateTimeoutMs ?? DEFAULT_TRANSLATE_TIMEOUT_MS) / 1000)}
        min={30}
        max={300}
        step={10}
        formatValue={seconds}
        defaultValue={DEFAULT_TRANSLATE_TIMEOUT_MS / 1000}
        help={settingHint('advanced.translateTimeoutMs')}
        modified={isFieldModified('advanced.translateTimeoutMs', s)}
        onchange={(v) => (textDrag = v)}
        oncommit={(v) => {
          textDrag = v;
          hold(v, onPatch({ translateTimeoutMs: v * 1000 }), (w) => {
            if (textDrag === w) textDrag = null;
          });
        }}
      />
    </div>
    <div data-ega-setting="advanced.imageTranslateTimeoutMs">
      <Slider
        label="Image answer timeout"
        value={imageDrag ??
          Math.round((s.imageTranslateTimeoutMs ?? DEFAULT_IMAGE_TRANSLATE_TIMEOUT_MS) / 1000)}
        min={60}
        max={300}
        step={10}
        formatValue={seconds}
        defaultValue={DEFAULT_IMAGE_TRANSLATE_TIMEOUT_MS / 1000}
        help={settingHint('advanced.imageTranslateTimeoutMs')}
        modified={isFieldModified('advanced.imageTranslateTimeoutMs', s)}
        onchange={(v) => (imageDrag = v)}
        oncommit={(v) => {
          imageDrag = v;
          hold(v, onPatch({ imageTranslateTimeoutMs: v * 1000 }), (w) => {
            if (imageDrag === w) imageDrag = null;
          });
        }}
      />
    </div>
    <div data-ega-setting="backends.localBackendTimeoutMs">
      <Slider
        label="Local check timeout"
        value={localSeconds}
        min={0.5}
        max={5}
        step={0.1}
        formatValue={seconds}
        defaultValue={DEFAULT_LOCAL_BACKEND_TIMEOUT_MS / 1000}
        help={settingHint('backends.localBackendTimeoutMs')}
        modified={isFieldModified('backends.localBackendTimeoutMs', s)}
        onchange={(v) => (localDrag = v)}
        oncommit={(v) => {
          localDrag = v;
          hold(v, onPatch({ localBackendTimeoutMs: Math.round(tenths(v) * 1000) }), (w) => {
            if (localDrag === w) localDrag = null;
          });
        }}
      />
    </div>
    <div data-ega-setting="advanced.backendProbeTtlMs">
      <Slider
        label="Remember backend status for"
        badge="Experimental"
        value={ttlDrag ?? Math.round(s.advanced.backendProbeTtlMs / 1000)}
        min={5}
        max={300}
        step={5}
        formatValue={seconds}
        defaultValue={DEFAULT_SETTINGS.advanced.backendProbeTtlMs / 1000}
        help={settingHint('advanced.backendProbeTtlMs')}
        modified={isFieldModified('advanced.backendProbeTtlMs', s)}
        onchange={(v) => (ttlDrag = v)}
        oncommit={(v) => {
          ttlDrag = v;
          hold(
            v,
            onPatch({ advanced: { backendProbeTtlMs: v * 1000 } as Settings['advanced'] }),
            (w) => {
              if (ttlDrag === w) ttlDrag = null;
            },
          );
        }}
      />
    </div>
  </SectionCard>
</div>
