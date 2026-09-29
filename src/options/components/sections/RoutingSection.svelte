<script lang="ts">
  import type { Settings } from '@/shared/types';
  import {
    DEFAULT_IMAGE_TRANSLATE_TIMEOUT_MS,
    DEFAULT_TRANSLATE_TIMEOUT_MS,
  } from '@/shared/constants';
  import { isFieldModified } from '@/shared/settings-registry';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Slider from '@/shared/ui/Slider.svelte';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
    onPatchAdvanced: (p: Partial<Settings['advanced']>) => Promise<void> | void;
  }
  const { s, onPatch, onPatchAdvanced }: Props = $props();

  // Both budgets are stored in ms and surfaced in seconds; ranges mirror settings-schema.
  const translateSeconds = $derived(
    Math.round((s.translateTimeoutMs ?? DEFAULT_TRANSLATE_TIMEOUT_MS) / 1000),
  );
  const imageSeconds = $derived(
    Math.round((s.imageTranslateTimeoutMs ?? DEFAULT_IMAGE_TRANSLATE_TIMEOUT_MS) / 1000),
  );
</script>

<SectionCard
  title="Routing & timeouts"
  description="How long Ega waits for an answer, and how many backends it tries before giving up."
>
  <div data-ega-setting="advanced.retryCount">
    <Slider
      label="Fallback depth"
      value={s.advanced.retryCount}
      min={0}
      max={3}
      step={1}
      help="How many more backends to try after the first one fails. 0 means never fall back."
      modified={isFieldModified('advanced.retryCount', s)}
      onchange={(v) => void onPatchAdvanced({ retryCount: v })}
    />
  </div>

  <div data-ega-setting="advanced.translateTimeoutMs">
    <Slider
      label="Text translate timeout"
      value={translateSeconds}
      min={30}
      max={300}
      step={10}
      unit=" s"
      help="Default 60 s. 30 s is tight for a reasoning model or a long Summarize."
      modified={isFieldModified('advanced.translateTimeoutMs', s)}
      onchange={(v) => void onPatch({ translateTimeoutMs: v * 1000 })}
    />
  </div>

  <div data-ega-setting="advanced.imageTranslateTimeoutMs">
    <Slider
      label="Image translate timeout"
      value={imageSeconds}
      min={60}
      max={300}
      step={10}
      unit=" s"
      help="Default 120 s. Vision and OCR answers take longer than text."
      modified={isFieldModified('advanced.imageTranslateTimeoutMs', s)}
      onchange={(v) => void onPatch({ imageTranslateTimeoutMs: v * 1000 })}
    />
  </div>
</SectionCard>
