<script lang="ts">
  import Popover from '@/shared/ui/Popover.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import TaskPicker from '@/shared/components/TaskPicker.svelte';
  import LanguagePicker from '@/shared/components/LanguagePicker.svelte';
  import ContextLevelPicker from '@/shared/components/ContextLevelPicker.svelte';
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
  import { ALL_TONES, TONE_LABELS, type Tone } from '@/shared/task-prompts';
  import type { TaskId, TaskView } from '@/shared/task-view';
  import type { Variety } from '@/shared/types';

  interface Props {
    open: boolean;
    anchor: HTMLElement | null;
    onClose: () => void;
    task: TaskId;
    sourceLang: string;
    targetLang: string;
    tone: Tone;
    taskViews: readonly TaskView[];
    varieties: readonly Variety[];
    /** The task's prompt has a tone slot. */
    usesTone: boolean;
    /** What swap would set; null hides the button, so there is no disabled control to explain. */
    swap: { source: string; target: string } | null;
    /** Tasks an attached image cannot go to; null when no image is attached. */
    imageBlocked: ReadonlySet<TaskId> | null;
    /** Page info is on in Settings. */
    contextEnabled: boolean;
    /** This task sends page info; the section shows only then. */
    taskSendsPage: boolean;
    pageContextLevel: 'minimal' | 'rich';
    onContextLevelChange: (level: 'minimal' | 'rich') => void;
    onOpenSettings: () => void;
  }

  let {
    open,
    anchor,
    onClose,
    task = $bindable(),
    sourceLang = $bindable(),
    targetLang = $bindable(),
    tone = $bindable(),
    taskViews,
    varieties,
    usesTone,
    swap,
    imageBlocked,
    contextEnabled,
    taskSendsPage,
    pageContextLevel,
    onContextLevelChange,
    onOpenSettings,
  }: Props = $props();

  const toneOptions = ALL_TONES.map((t) => ({ value: t, label: TONE_LABELS[t] }));
</script>

<Popover {open} {anchor} {onClose} placement="top-start" title="Next message">
  <div class="mp" data-ega-mode-popover>
    <section class="mp-section" aria-labelledby="mp-task">
      <h3 class="mp-label" id="mp-task">Task</h3>
      {#if imageBlocked !== null}
        <p class="mp-note">Images work with Translate and Explain</p>
      {/if}
      <TaskPicker
        bind:task
        views={taskViews}
        {...imageBlocked !== null ? { unavailable: imageBlocked } : {}}
      />
    </section>

    <section class="mp-section" aria-labelledby="mp-lang">
      <h3 class="mp-label" id="mp-lang">Language</h3>
      <div class="mp-langs">
        <label class="mp-row-label" for="sp-conv-source">From</label>
        <LanguagePicker
          id="sp-conv-source"
          {varieties}
          includeAuto
          suppressAriaLabel
          bind:value={sourceLang}
        />
        {#if swap !== null}
          <span class="mp-swap">
            <IconButton
              icon={ArrowUpDown}
              ariaLabel="Swap languages"
              size="sm"
              dataAttrs={{ 'data-ega-swap': 'true' }}
              onclick={() => {
                if (swap === null) return;
                sourceLang = swap.source;
                targetLang = swap.target;
              }}
            />
          </span>
        {/if}
        <label class="mp-row-label" for="sp-conv-target">To</label>
        <LanguagePicker id="sp-conv-target" {varieties} suppressAriaLabel bind:value={targetLang} />
      </div>
    </section>

    {#if usesTone}
      <section class="mp-section mp-tone">
        <label class="mp-label" for="sp-tone">Tone</label>
        <Select
          id="sp-tone"
          bind:value={tone}
          options={toneOptions}
          size="sm"
          selectAttrs={{ 'data-ega-tone-select': '' }}
        />
      </section>
    {/if}

    {#if taskSendsPage}
      <section class="mp-section">
        {#if contextEnabled}
          <ContextLevelPicker value={pageContextLevel} onchange={onContextLevelChange} />
        {:else}
          <h3 class="mp-label">Page info</h3>
          <p class="mp-note">
            Page info is off.
            <button type="button" class="mp-link" onclick={onOpenSettings}
              >Turn on in Settings</button
            >
          </p>
        {/if}
      </section>
    {/if}
  </div>
</Popover>

<style>
  .mp {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    inline-size: min(320px, calc(100vw - var(--space-5)));
    padding: var(--space-1);
    box-sizing: border-box;
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
  }
  .mp-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .mp-label {
    margin: 0;
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--color-fg);
  }
  .mp-note {
    margin: 0;
    color: var(--color-muted);
  }
  .mp-langs {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-1) var(--space-2);
  }
  .mp-row-label {
    color: var(--color-muted);
  }
  .mp-langs :global(.ega-lang-picker) {
    min-inline-size: 0;
    inline-size: 100%;
  }
  /* Spans both rows: it trades From and To. */
  .mp-swap {
    grid-column: 3;
    grid-row: 1 / span 2;
  }
  .mp-tone {
    flex-direction: row;
    align-items: center;
    gap: var(--space-2);
  }
  .mp-tone :global(.ega-select-wrap) {
    flex: 1 1 auto;
    min-inline-size: 0;
  }
  .mp-link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-accent);
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
</style>
