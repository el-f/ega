<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { isFieldModified } from '@/shared/settings-registry';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import PerfHistogram from '@/shared/components/PerfHistogram.svelte';
  import type { PerfEntry } from '@/shared/perf-history';
  import { AUDIT_LOG_CAP } from '@/shared/audit-log';
  import RequestAuditLog from '@/options/components/RequestAuditLog.svelte';
  import AttemptFailureBreakdown from '@/options/components/AttemptFailureBreakdown.svelte';
  import SectionReset from '@/options/components/SectionReset.svelte';
  import SettingHint from '@/options/components/SettingHint.svelte';
  import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

  type LogLevel = Settings['advanced']['debugLogLevel'];
  const LOG_LEVEL_OPTIONS: ReadonlyArray<{ value: LogLevel; label: string }> = [
    { value: 'silent', label: 'Off' },
    { value: 'error', label: 'Errors' },
    { value: 'warn', label: 'Warnings (default)' },
    { value: 'info', label: 'Info' },
    { value: 'debug', label: 'Everything' },
  ];

  interface Props {
    s: Settings;
    onPatchField: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
    onPatchAdvanced: (p: Partial<Settings['advanced']>) => Promise<void>;
  }

  const { s, onPatchField, onPatchAdvanced }: Props = $props();

  const DEF = DEFAULT_SETTINGS;
  const toolsModified = $derived(
    isFieldModified('advanced.captureResultMeta', s) ||
      isFieldModified('advanced.debugLogLevel', s),
  );
  async function resetTools(): Promise<void> {
    await onPatchField('captureResultMeta', DEF.captureResultMeta);
    await onPatchAdvanced({ debugLogLevel: DEF.advanced.debugLogLevel });
  }

  // The histogram asks the worker for its buffer; the card header needs it for Copy data.
  let perfEntries = $state.raw<readonly PerfEntry[]>([]);
  let copied = $state(false);
  async function copyPerf(): Promise<void> {
    try {
      await navigator.clipboard.writeText(JSON.stringify(perfEntries, null, 2));
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }
</script>

<div data-ega-setting="advanced.auditLog">
  <RequestAuditLog />
</div>

<div data-ega-setting="advanced.perBackendStats">
  <SectionCard
    title="Response times"
    description="Typical and slowest times since Ega last started"
  >
    {#snippet headerActions()}
      {#if perfEntries.length > 0 && s.captureResultMeta}
        <Button
          variant="secondary"
          size="sm"
          dataAttrs={{ 'data-ega-perf-copy': true }}
          onclick={() => void copyPerf()}>{copied ? 'Copied' : 'Copy data'}</Button
        >
      {/if}
    {/snippet}
    <div data-ega-debug-section>
      <PerfHistogram off={!s.captureResultMeta} bind:entries={perfEntries} />
    </div>
  </SectionCard>
</div>

<div data-ega-setting="advanced.attemptFailures">
  <SectionCard
    title="Recent errors"
    description="Errors in the last hour"
    info={{
      label: 'About recent errors',
      text: "The same error from the same backend shows once with a count. Details has the backend's own message.",
    }}
  >
    <AttemptFailureBreakdown />
  </SectionCard>
</div>

<SectionCard
  title="Diagnostics settings"
  info={{
    label: 'About diagnostics',
    text: `Turning off Record request details stops response times. The request list keeps its last ${AUDIT_LOG_CAP} requests.`,
  }}
>
  {#snippet headerActions()}
    <SectionReset
      modified={toolsModified}
      onReset={resetTools}
      ariaLabel="Reset section: Diagnostics settings"
    />
  {/snippet}
  <div class="capture-meta" data-ega-setting="advanced.captureResultMeta">
    <Checkbox
      id="adv-capture-meta"
      checked={s.captureResultMeta}
      label="Record request details"
      describedBy="adv-capture-meta-hint"
      onchange={(v) => void onPatchField('captureResultMeta', v)}
    />
    <SettingHint setting="advanced.captureResultMeta" id="adv-capture-meta-hint" indent />
  </div>
  <div class="log-level" data-ega-setting="advanced.debugLogLevel">
    <Select
      label="Log detail"
      value={s.advanced.debugLogLevel}
      options={LOG_LEVEL_OPTIONS}
      id="adv-log-level"
      modified={isFieldModified('advanced.debugLogLevel', s)}
      onchange={(v) => void onPatchAdvanced({ debugLogLevel: v })}
    />
  </div>
</SectionCard>

<style>
  .capture-meta {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-3);
  }
  .log-level {
    display: flex;
  }
</style>
