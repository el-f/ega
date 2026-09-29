<script lang="ts">
  import type { Settings } from '@/shared/types';
  import {
    DEFAULT_SELECTION_CONTEXT_CAP,
    DEFAULT_DESCRIPTION_CONTEXT_CAP,
    DEFAULT_HEADING_TRAIL_DEPTH,
    DEFAULT_HEADING_TRAIL_ENTRY_CAP,
    DEFAULT_POST_TEXT_CAP,
  } from '@/shared/constants';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import CollapsibleField from '@/shared/ui/CollapsibleField.svelte';
  import Select from '@/shared/ui/Select.svelte';
  import Slider from '@/shared/ui/Slider.svelte';
  import { isFieldModified } from '@/shared/settings-registry';
  import Icon from '@/shared/ui/Icon.svelte';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
  }
  const { s, onPatch }: Props = $props();
</script>

<SectionCard
  title="Page context"
  description="Send the page title, address and nearby text with selection and side panel requests."
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

  <div data-ega-setting="display.explainUsesPageImage">
    <Checkbox
      id="explain-uses-page-image-toggle"
      label="Explain can read the page image"
      checked={s.explainUsesPageImage}
      modified={isFieldModified('display.explainUsesPageImage', s)}
      onchange={(next) => void onPatch({ explainUsesPageImage: next })}
    />
    <p class="setting-help">
      Explain on selected text also sends the page's one dominant image, so the model can read the
      picture the text is about. Off stops the download.
    </p>
  </div>

  <CollapsibleField open={s.contextEnabled}>
    <div data-ega-setting="display.pageContextLevel">
      <Select
        label="Context depth"
        value={s.pageContextLevel}
        options={[
          { value: 'minimal', label: 'Minimal — title, URL, text around the selection' },
          {
            value: 'rich',
            label: `Rich — adds page language, headings, description and site name, and, on a selection, up to ${DEFAULT_POST_TEXT_CAP} characters of the post around it`,
          },
        ]}
        modified={isFieldModified('display.pageContextLevel', s)}
        onchange={(v) => void onPatch({ pageContextLevel: v })}
      />
    </div>

    <div data-ega-setting="advanced.pageContextPayload">
      <div data-ega-setting="advanced.selectionContextCap">
        <Slider
          label="Selection window"
          value={s.selectionContextCap ?? DEFAULT_SELECTION_CONTEXT_CAP}
          min={50}
          max={800}
          step={10}
          unit=" chars"
          help="Before/after text snippet captured around the selection."
          modified={isFieldModified('advanced.selectionContextCap', s)}
          onchange={(v) => void onPatch({ selectionContextCap: v })}
        />
      </div>
      <div data-ega-setting="advanced.descriptionContextCap">
        <Slider
          label="Page description"
          value={s.descriptionContextCap ?? DEFAULT_DESCRIPTION_CONTEXT_CAP}
          min={100}
          max={500}
          step={10}
          unit=" chars"
          help="Longest page description sent with Rich context."
          modified={isFieldModified('advanced.descriptionContextCap', s)}
          onchange={(v) => void onPatch({ descriptionContextCap: v })}
        />
      </div>
      <div data-ega-setting="advanced.headingTrailDepth">
        <Slider
          label="Heading trail depth"
          value={s.headingTrailDepth ?? DEFAULT_HEADING_TRAIL_DEPTH}
          min={1}
          max={10}
          step={1}
          help="Rich-context only. Up to N nearest h1–h6 headings."
          modified={isFieldModified('advanced.headingTrailDepth', s)}
          onchange={(v) => void onPatch({ headingTrailDepth: v })}
        />
      </div>
      <div data-ega-setting="advanced.headingTrailEntryCap">
        <Slider
          label="Heading trail entry cap"
          value={s.headingTrailEntryCap ?? DEFAULT_HEADING_TRAIL_ENTRY_CAP}
          min={50}
          max={200}
          step={5}
          unit=" chars"
          help="Maximum length of any single heading in the trail."
          modified={isFieldModified('advanced.headingTrailEntryCap', s)}
          onchange={(v) => void onPatch({ headingTrailEntryCap: v })}
        />
      </div>
      <div class="redact-status" data-ega-setting="advanced.redactContext">
        <span class="redact-status-icon" aria-hidden="true">
          <Icon icon={ShieldCheck} size={16} />
        </span>
        <div class="redact-status-body">
          <span class="redact-status-label">
            Redact secrets in page context
            <span class="redact-status-badge">Always on</span>
          </span>
          <span class="redact-status-help">
            API keys, tokens, and other secrets are stripped from page context before it leaves your
            machine.
          </span>
        </div>
      </div>
    </div>
  </CollapsibleField>
</SectionCard>

<style>
  .setting-help {
    margin: 2px 0 0 var(--space-5);
    font-size: var(--fs-xs);
    color: var(--color-muted);
    line-height: var(--lh-body);
  }
  .redact-status {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }
  .redact-status-icon {
    color: var(--color-success-fg);
    flex: 0 0 auto;
    margin-top: 1px;
  }
  .redact-status-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .redact-status-label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--fs-sm);
    color: var(--color-fg);
  }
  .redact-status-badge {
    padding: 1px var(--space-1);
    border-radius: var(--radius-pill);
    background: var(--color-success-bg-soft, var(--color-bg-sunken));
    color: var(--color-success-fg);
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .redact-status-help {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    line-height: var(--lh-body);
  }
</style>
