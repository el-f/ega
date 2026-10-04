<script lang="ts">
  import type { Tone } from '@/shared/task-prompts';
  import { ALL_TONES, TONE_LABELS, builtInTask } from '@/shared/task-prompts';
  import { SHIPPED_TASK_VIEWS, taskLabel, type TaskId, type TaskView } from '@/shared/task-view';
  import Select from '@/shared/ui/Select.svelte';
  import { isUserGesture } from '../user-gesture';

  interface Props {
    task: TaskId;
    tone: Tone;
    /** The task's prompt has a {{tone}} slot, so the tone select shows. */
    usesTone: boolean;
    /** Every task, on or off; the current task, when off or deleted, shows disabled. */
    views?: readonly TaskView[] | undefined;
    onTaskChange: (task: TaskId, tone: Tone) => void;
  }

  let { task, tone, usesTone, views = SHIPPED_TASK_VIEWS, onTaskChange }: Props = $props();

  // The shadow root is open, so page script can read option values: a custom task's uuid would be a stable cross-site id.
  const shown = $derived.by(() => {
    const out = views
      .filter((v) => !v.disabled || v.id === task)
      .map((v) => ({ id: v.id, label: v.label, disabled: v.disabled }));
    if (!out.some((o) => o.id === task)) {
      out.push({ id: task, label: taskLabel(views, task), disabled: true });
    }
    return out;
  });
  const valueOf = (id: TaskId, i: number): string => (builtInTask(id) ? id : `custom-${i}`);
  const taskOptions = $derived(
    shown.map((o, i) => ({ value: valueOf(o.id, i), label: o.label, disabled: o.disabled })),
  );
  const taskValue = $derived(taskOptions[shown.findIndex((o) => o.id === task)]?.value ?? task);
  const toneOptions = $derived(ALL_TONES.map((t) => ({ value: t, label: TONE_LABELS[t] })));
</script>

<!-- Selects, not a segmented button bar: the tooltip header is too narrow for one. -->
<div class="task-row" data-ega-task-row>
  <Select
    value={taskValue}
    options={taskOptions}
    size="sm"
    ariaLabel="Task"
    selectClass="task-select"
    selectAttrs={{ 'data-ega-task-select': '' }}
    onchange={(v, e) => {
      const picked = shown[taskOptions.findIndex((o) => o.value === v)];
      if (picked && isUserGesture(e)) onTaskChange(picked.id, tone);
    }}
  />
  {#if usesTone}
    <Select
      value={tone}
      options={toneOptions}
      size="sm"
      ariaLabel="Tone"
      selectClass="tone-select"
      selectAttrs={{ 'data-ega-tone-select': '' }}
      onchange={(tn, e) => {
        if (isUserGesture(e)) onTaskChange(task, tn);
      }}
    />
  {/if}
</div>
