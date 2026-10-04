<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { isFieldModified } from '@/shared/settings-registry';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import PerfHistogram from '@/shared/components/PerfHistogram.svelte';
  import RequestAuditLog from '@/options/components/RequestAuditLog.svelte';
  import AttemptFailureBreakdown from '@/options/components/AttemptFailureBreakdown.svelte';
  import SectionReset from '@/options/components/SectionReset.svelte';
  import ResetField from '@/shared/ui/ResetField.svelte';
  import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

  type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';
  const LOG_LEVEL_OPTIONS: ReadonlyArray<{ value: LogLevel; label: string }> = [
    { value: 'silent', label: 'silent' },
    { value: 'error', label: 'error' },
    { value: 'warn', label: 'warn (default)' },
    { value: 'info', label: 'info' },
    { value: 'debug', label: 'debug' },
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
</script>

<div data-ega-setting="advanced.auditLog">
  <SectionCard
    title="Request audit log"
    description="Last 50 requests, stored locally, never synced. Cleared only here or by Delete all data."
  >
    <RequestAuditLog />
  </SectionCard>
</div>

<div data-ega-setting="advanced.perBackendStats">
  <SectionCard
    title="Latency histogram"
    description="P50 / P95 over the last 128 translations since the background worker last started."
  >
    <div data-ega-debug-section>
      <PerfHistogram />
    </div>
  </SectionCard>
</div>

<div data-ega-setting="advanced.attemptFailures">
  <SectionCard
    title="Attempt failure breakdown"
    description="Errors over the last hour, grouped by code."
  >
    <AttemptFailureBreakdown />
  </SectionCard>
</div>

<SectionCard
  title="Diagnostics tools"
  description="Record timing and token details for each request, and set the log level."
>
  {#snippet headerActions()}
    <SectionReset
      modified={toolsModified}
      onReset={resetTools}
      ariaLabel="Reset Diagnostics tools section to defaults"
    />
  {/snippet}
  <div class="capture-meta" data-ega-setting="advanced.captureResultMeta">
    <div class="row">
      <Checkbox
        id="adv-capture-meta"
        checked={s.captureResultMeta}
        label="Record request details"
        onchange={(v) => void onPatchField('captureResultMeta', v)}
      />
    </div>
    <p class="warn-caption">
      Keeps timing, token counts and backend details for the Details drawer and the latency
      histogram. Turning it off stops the histogram; the request log keeps its last 50 requests.
    </p>
  </div>
  <div class="gen-row" data-ega-setting="advanced.debugLogLevel">
    <Select
      label="Debug log level"
      value={s.advanced.debugLogLevel}
      options={LOG_LEVEL_OPTIONS}
      selectAttrs={{ id: 'adv-log-level' }}
      modified={isFieldModified('advanced.debugLogLevel', s)}
      onchange={(v) => void onPatchAdvanced({ debugLogLevel: v })}
    />
    <ResetField
      differsFromInherited={isFieldModified('advanced.debugLogLevel', s)}
      onReset={() => onPatchAdvanced({ debugLogLevel: DEF.advanced.debugLogLevel })}
      ariaLabel="Reset debug log level"
      inheritedLabel={`Default ${DEF.advanced.debugLogLevel}`}
    />
  </div>
</SectionCard>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .gen-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    flex-wrap: wrap;
  }
  .capture-meta {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
  }
  .warn-caption {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
</style>
