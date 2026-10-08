<script lang="ts">
  import type { Settings } from '@/shared/types';
  import {
    DEFAULT_SELECTION_CONTEXT_CAP,
    DEFAULT_DESCRIPTION_CONTEXT_CAP,
    DEFAULT_HEADING_TRAIL_DEPTH,
    DEFAULT_HEADING_TRAIL_ENTRY_CAP,
  } from '@/shared/constants';
  import type { CustomTask } from '@/shared/settings-schema';
  import { getCustomTasks } from '@/shared/storage';
  import { materializeTasks } from '@/shared/task-view';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import CollapsibleField from '@/shared/ui/CollapsibleField.svelte';
  import Slider from '@/shared/ui/Slider.svelte';
  import Badge from '@/shared/ui/Badge.svelte';
  import ChoiceCards from '@/options/components/ChoiceCards.svelte';
  import Disclosure from '@/options/components/Disclosure.svelte';
  import SettingHint from '@/options/components/SettingHint.svelte';
  import TaskUsageRow from '@/options/components/TaskUsageRow.svelte';
  import { isFieldModified, settingHint } from '@/shared/settings-registry';
  import Icon from '@/shared/ui/Icon.svelte';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
  }
  const { s, onPatch }: Props = $props();

  let customs = $state.raw<CustomTask[]>([]);
  $effect(() => {
    let alive = true;
    void getCustomTasks().then((rows) => {
      if (alive) customs = rows;
    });
    return () => {
      alive = false;
    };
  });
  const sentWith = $derived(
    materializeTasks(s, customs, { enabledOnly: true })
      .filter((v) => v.pageContext)
      .map((v) => v.label),
  );

  // Mounted under Minimal too, so a settings search for these limits always has a target.
  const richOnly = $derived(s.pageContextLevel !== 'rich');

  const LEVELS = [
    {
      value: 'minimal',
      label: 'Minimal',
      hint: 'Title, address and the text around the selection',
    },
    {
      value: 'rich',
      label: 'Rich',
      hint: 'Also the description, headings and the post around the selection',
    },
  ] as const;
</script>

<SectionCard
  title="Page context"
  description="Sends the page title, address and nearby text with your request"
  groups
  info={{
    label: 'About page context',
    text: 'Page context helps with slang, names and short replies. Secrets such as API keys and tokens are removed before anything leaves your computer.',
  }}
>
  <div data-ega-setting="display.contextEnabled">
    <Checkbox
      id="page-context-toggle"
      label="Send page context"
      checked={s.contextEnabled}
      modified={isFieldModified('display.contextEnabled', s)}
      onchange={(next) => void onPatch({ contextEnabled: next })}
    />
  </div>

  <TaskUsageRow
    label="Sent with"
    names={s.contextEnabled ? sentWith : []}
    emptyText={s.contextEnabled ? 'No task sends it' : 'None, page context is off'}
    changeName="Change which tasks send page context"
  />

  <div data-ega-setting="display.explainUsesPageImage">
    <Checkbox
      id="explain-uses-page-image-toggle"
      label="Send the page image with Explain"
      checked={s.explainUsesPageImage}
      describedBy="explain-page-image-hint"
      modified={isFieldModified('display.explainUsesPageImage', s)}
      onchange={(next) => void onPatch({ explainUsesPageImage: next })}
    />
    <SettingHint setting="display.explainUsesPageImage" id="explain-page-image-hint" indent />
  </div>

  <CollapsibleField open={s.contextEnabled}>
    <div class="pc-level" data-ega-setting="display.pageContextLevel">
      <span class="pc-label" id="page-context-level-label">How much</span>
      <ChoiceCards
        value={s.pageContextLevel}
        choices={LEVELS}
        ariaLabelledby="page-context-level-label"
        itemAttr="data-ega-context-level"
        onchange={(v) => void onPatch({ pageContextLevel: v })}
      />
    </div>

    <Disclosure
      label="Fine-tune what is sent"
      dataAttrs={{ 'data-ega-setting': 'advanced.pageContextPayload' }}
    >
      <div data-ega-setting="advanced.selectionContextCap">
        <Slider
          label="Selection window"
          value={s.selectionContextCap ?? DEFAULT_SELECTION_CONTEXT_CAP}
          min={50}
          max={800}
          step={10}
          unit=" characters"
          defaultValue={DEFAULT_SELECTION_CONTEXT_CAP}
          help={settingHint('advanced.selectionContextCap')}
          modified={isFieldModified('advanced.selectionContextCap', s)}
          onchange={(v) => void onPatch({ selectionContextCap: v })}
        />
      </div>
      {#if richOnly}
        <p id="page-context-rich-only" class="pc-reason" data-ega-disabled-reason>
          Used only with Rich
        </p>
      {/if}
      <div data-ega-setting="advanced.descriptionContextCap">
        <Slider
          label="Page description"
          value={s.descriptionContextCap ?? DEFAULT_DESCRIPTION_CONTEXT_CAP}
          min={100}
          max={500}
          step={10}
          unit=" characters"
          defaultValue={DEFAULT_DESCRIPTION_CONTEXT_CAP}
          help={settingHint('advanced.descriptionContextCap')}
          modified={isFieldModified('advanced.descriptionContextCap', s)}
          disabled={richOnly}
          {...richOnly ? { describedById: 'page-context-rich-only' } : {}}
          onchange={(v) => void onPatch({ descriptionContextCap: v })}
        />
      </div>
      <div data-ega-setting="advanced.headingTrailDepth">
        <Slider
          label="Headings sent"
          value={s.headingTrailDepth ?? DEFAULT_HEADING_TRAIL_DEPTH}
          min={1}
          max={10}
          step={1}
          defaultValue={DEFAULT_HEADING_TRAIL_DEPTH}
          help={settingHint('advanced.headingTrailDepth')}
          modified={isFieldModified('advanced.headingTrailDepth', s)}
          disabled={richOnly}
          {...richOnly ? { describedById: 'page-context-rich-only' } : {}}
          onchange={(v) => void onPatch({ headingTrailDepth: v })}
        />
      </div>
      <div data-ega-setting="advanced.headingTrailEntryCap">
        <Slider
          label="Longest heading"
          value={s.headingTrailEntryCap ?? DEFAULT_HEADING_TRAIL_ENTRY_CAP}
          min={50}
          max={200}
          step={5}
          unit=" characters"
          defaultValue={DEFAULT_HEADING_TRAIL_ENTRY_CAP}
          help={settingHint('advanced.headingTrailEntryCap')}
          modified={isFieldModified('advanced.headingTrailEntryCap', s)}
          disabled={richOnly}
          {...richOnly ? { describedById: 'page-context-rich-only' } : {}}
          onchange={(v) => void onPatch({ headingTrailEntryCap: v })}
        />
      </div>
    </Disclosure>

    <div class="redact-status" data-ega-setting="advanced.redactContext">
      <span class="redact-status-icon" aria-hidden="true">
        <Icon icon={ShieldCheck} size={16} />
      </span>
      <span class="redact-status-label">Secrets are removed from page context</span>
      <Badge variant="success">Always on</Badge>
    </div>
  </CollapsibleField>
</SectionCard>

<style>
  .pc-level {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .pc-label {
    font-size: var(--fs-base);
    font-weight: 600;
  }
  .pc-reason {
    margin: 0;
    font-size: var(--fs-base);
    color: var(--color-muted);
  }
  .redact-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--fs-base);
  }
  .redact-status-icon {
    display: inline-flex;
    color: var(--color-success-fg);
  }
</style>
