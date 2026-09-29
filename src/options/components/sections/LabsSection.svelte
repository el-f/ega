<script lang="ts">
  import type { Settings, BackendId } from '@/shared/types';
  import { isFieldModified } from '@/shared/settings-registry';
  import type { Task } from '@/shared/task-prompts';
  import { ALL_TASKS, TASK_LABELS } from '@/shared/task-prompts';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Badge from '@/shared/ui/Badge.svelte';
  import Slider from '@/shared/ui/Slider.svelte';
  import BackendChainInput from '@/options/components/BackendChainInput.svelte';

  interface Props {
    s: Settings;
    backendIds: readonly BackendId[];
    onPatchAdvanced: (p: Partial<Settings['advanced']>) => Promise<void> | void;
    onSetTaskBackendChain: (task: Task, chain: readonly string[]) => Promise<void>;
  }
  const { s, backendIds, onPatchAdvanced, onSetTaskBackendChain }: Props = $props();

  // Probe TTL stored as ms; surfaced to the slider in seconds. Range mirrors
  // settings-schema (5_000–300_000 ms / 5–300 s, step 5 s, default 30 s).
  const probeTtlSeconds = $derived(Math.round(s.advanced.backendProbeTtlMs / 1000));
</script>

<SectionCard
  title="Labs"
  description="Experimental settings. They may change or go away in a later release."
>
  <div class="labs-row" data-ega-setting="advanced.taskBackendChains">
    <div class="labs-row-head">
      <span class="labs-row-title">Per-task backend order</span>
      <Badge variant="warning">Labs</Badge>
    </div>
    <p id="labs-chains-warn" class="labs-warn">
      Overrides the global fallback order per task. A bad order can route every request to a
      disabled backend until you fix it here.
    </p>
    <ul class="task-chain-list">
      {#each ALL_TASKS as task (task)}
        <li class="task-chain-row" data-ega-backend-chain-row={task}>
          <span class="task-label">{TASK_LABELS[task]}</span>
          <div class="task-chain-input">
            <BackendChainInput
              value={s.advanced.taskBackendChains?.[task] ?? []}
              options={backendIds}
              describedById="labs-chains-warn"
              onChange={(chain) => void onSetTaskBackendChain(task, chain)}
            />
          </div>
        </li>
      {/each}
    </ul>
  </div>

  <div class="labs-row" data-ega-setting="advanced.backendProbeTtlMs">
    <div class="labs-row-head">
      <span class="labs-row-title">Backend status memory</span>
      <Badge variant="warning">Labs</Badge>
    </div>
    <p id="labs-probe-warn" class="labs-warn">
      How long Ega remembers whether a backend is reachable before checking again. Lower means more
      network requests. Higher means Ega notices later that a backend is back online.
    </p>
    <Slider
      label="Remember for"
      value={probeTtlSeconds}
      min={5}
      max={300}
      step={5}
      unit=" s"
      help="Default 30 s."
      modified={isFieldModified('advanced.backendProbeTtlMs', s)}
      describedById="labs-probe-warn"
      onchange={(v) => void onPatchAdvanced({ backendProbeTtlMs: v * 1000 })}
    />
  </div>
</SectionCard>

<style>
  .labs-row {
    padding: var(--space-3) 0;
    border-top: 1px solid var(--color-border-subtle);
  }
  .labs-row:first-child {
    border-top: 0;
    padding-top: 0;
  }
  .labs-row-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }
  .labs-row-title {
    font-weight: 500;
    color: var(--color-fg);
  }
  .labs-warn {
    margin: 0 0 var(--space-2);
    color: var(--color-muted);
    font-size: var(--fs-sm);
  }
  .task-chain-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .task-chain-row {
    display: grid;
    grid-template-columns: minmax(8ch, 14ch) 1fr;
    align-items: start;
    gap: var(--space-3);
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .task-chain-row:last-child {
    border-bottom: 0;
  }
  .task-label {
    font-size: var(--fs-sm);
    color: var(--color-fg);
    padding-top: var(--space-1);
  }
  .task-chain-input {
    min-width: 0;
  }
</style>
