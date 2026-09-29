<script lang="ts">
  import type { Task, Tone } from '@/shared/task-prompts';
  import { ALL_TASKS, TASK_LABELS, ALL_TONES, TONE_LABELS } from '@/shared/task-prompts';
  import Select from '@/shared/ui/Select.svelte';
  import { isUserGesture } from '../user-gesture';

  interface Props {
    task: Task;
    tone: Tone;
    onTaskChange: (task: Task, tone: Tone) => void;
  }

  let { task, tone, onTaskChange }: Props = $props();

  const taskOptions = $derived(ALL_TASKS.map((t) => ({ value: t, label: TASK_LABELS[t] })));
  const toneOptions = $derived(ALL_TONES.map((t) => ({ value: t, label: TONE_LABELS[t] })));
</script>

<!-- Selects, not a segmented button bar: the tooltip header is too narrow for one. -->
<div class="task-row" data-ega-task-row>
  <Select
    value={task}
    options={taskOptions}
    size="sm"
    ariaLabel="Task"
    selectClass="task-select"
    selectAttrs={{ 'data-ega-task-select': '' }}
    onchange={(t, e) => {
      if (isUserGesture(e)) onTaskChange(t, tone);
    }}
  />
  {#if task === 'reword'}
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
