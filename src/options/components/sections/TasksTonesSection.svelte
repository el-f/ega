<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { isFieldModified } from '@/shared/settings-registry';
  import {
    ALL_TASKS,
    ALL_TONES,
    TASK_LABELS,
    TONE_LABELS,
    type Task,
    type Tone,
  } from '@/shared/task-prompts';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import CollapsibleField from '@/shared/ui/CollapsibleField.svelte';
  import Select from '@/shared/ui/Select.svelte';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
  }
  const { s, onPatch }: Props = $props();

  // NVDA and JAWS announce an empty `<option value="">` as "blank", so the inherit option needs a real string.
  const INHERIT = '__inherit__';

  const taskOptions = ALL_TASKS.map((t) => ({ value: t, label: TASK_LABELS[t] }));
  const toneOptions = ALL_TONES.map((t) => ({ value: t, label: TONE_LABELS[t] }));
  const overrideOptions = [{ value: INHERIT, label: '(inherit default)' }, ...toneOptions];

  function setRewordTaskTone(v: string): void {
    const taskTones: Settings['advanced']['taskTones'] = { ...s.advanced.taskTones };
    if (v === INHERIT) {
      delete taskTones['reword'];
    } else {
      taskTones['reword'] = v as Tone;
    }
    void onPatch({ advanced: { ...s.advanced, taskTones } });
  }
</script>

<SectionCard title="Default task" description="What Ega does with a selection by default.">
  <div data-ega-setting="defaults.defaultTask">
    <Select
      label="Task"
      value={s.defaultTask}
      size="sm"
      options={taskOptions}
      modified={isFieldModified('defaults.defaultTask', s)}
      onchange={(v) => void onPatch({ defaultTask: v as Task })}
    />
  </div>

  <CollapsibleField open={s.defaultTask === 'reword'}>
    <div data-ega-setting="defaults.defaultTone">
      <Select
        label="Default tone"
        value={s.defaultTone}
        size="sm"
        options={toneOptions}
        modified={isFieldModified('defaults.defaultTone', s)}
        onchange={(v) => void onPatch({ defaultTone: v as Tone })}
      />
    </div>
    <div data-ega-setting="advanced.taskTones">
      <Select
        label="Override tone for Reword task only"
        value={s.advanced.taskTones?.['reword'] ?? INHERIT}
        size="sm"
        options={overrideOptions}
        modified={!!s.advanced.taskTones?.['reword']}
        onchange={setRewordTaskTone}
      />
    </div>
  </CollapsibleField>
</SectionCard>
