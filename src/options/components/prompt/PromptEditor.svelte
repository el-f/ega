<script lang="ts">
  /**
   * The one prompt editor (task dialog, custom task dialog, language dialog): Instructions, the locked
   * Answer format, Message, an Insert variable list and a Preview of the prompt as sent. It is controlled:
   * the dialog owns the draft, saving and reset.
   */
  import { tick, type Snippet } from 'svelte';
  import Lock from '@lucide/svelte/icons/lock';
  import InfoTip from '@/shared/ui/InfoTip.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import Segmented from '@/shared/ui/Segmented.svelte';
  import { CHAT_HISTORY_TOKEN_BUDGET } from '@/shared/chat-history';
  import { expandSnippets, SLOT_RE } from '@/shared/snippets';
  import { hasAnswerFormat, readsPageContext, stripStandardFormat } from '@/shared/prompts';
  import { TEMPLATE_MAX } from '@/shared/settings-schema';
  import type { AnswerFormat } from '@/shared/task-prompts';
  import type { PromptTemplate } from '@/shared/types';
  import { id as makeId } from '@/shared/uuid';
  import { PREVIEW_SAMPLE_TEXT } from '@/options/preview-prompt';
  import VariablePicker from './VariablePicker.svelte';
  import { checkPrompt, variablesFor, type PromptKind } from './prompt-checks';

  interface Props {
    kind: PromptKind;
    /** A built-in task, or a custom task's id. */
    task: string;
    /** The live draft. */
    template: PromptTemplate;
    /** The shipped prompt to compare with ("Edited"); null when there is none (a custom task). */
    builtIn: PromptTemplate | null;
    /** A built-in's answer format (a prompt that holds its own is kept), or a custom task's fixed contract. */
    format: AnswerFormat | string;
    snippets: Record<string, string>;
    /** The task sends page context, so the Preview notes what a page adds. */
    sendsPageContext: boolean;
    onChange: (next: PromptTemplate) => void;
    /** The prompt as the router builds it; `explain` only for the Translate prompt and language prompts. */
    buildPreview: (draft: PromptTemplate, explain: boolean) => { system: string; user: string };
    /** Shown above the fields (the newer built-in prompt notice). */
    notice?: Snippet;
  }

  const {
    kind,
    task,
    template,
    builtIn,
    format,
    snippets,
    sendsPageContext,
    onChange,
    buildPreview,
    notice,
  }: Props = $props();

  const uid = makeId('ega-prompt');
  const sysId = `${uid}-sys`;
  const usrId = `${uid}-usr`;
  const msgErrId = `${uid}-msg-err`;
  const editPanelId = `${uid}-edit`;
  const previewPanelId = `${uid}-preview`;

  let view = $state<'edit' | 'preview'>('edit');
  let previewAs = $state<'translate' | 'explain'>('translate');
  const offersExplainPreview = $derived(kind === 'translate' || kind === 'language');

  let sysEl = $state<HTMLTextAreaElement | null>(null);
  let usrEl = $state<HTMLTextAreaElement | null>(null);
  // The Message holds {{text}}, so it is the default target until another field gets focus.
  let lastField: 'system' | 'user' = 'user';

  const checks = $derived(checkPrompt(template, kind, task));
  const variables = $derived(variablesFor(kind, task));
  const used = $derived(
    new Set([...`${template.system}\n${template.user}`.matchAll(SLOT_RE)].map((m) => m[1] ?? '')),
  );
  const sysEdited = $derived(builtIn !== null && template.system !== builtIn.system);
  const usrEdited = $derived(builtIn !== null && template.user !== builtIn.user);

  const contract = $derived(typeof format === 'string' ? null : format);
  const formatText = $derived(
    typeof format === 'string' ? format : format.text.replace('{{explainField}}', ''),
  );
  // A prompt edited before the format left the editable text still carries its own; Ega sends that one.
  const ownFormat = $derived(contract !== null && hasAnswerFormat(template.system, snippets));
  const stripped = $derived(
    contract !== null && ownFormat ? stripStandardFormat(template.system, contract) : null,
  );

  const tooLongWithSnippets = $derived(
    Object.keys(snippets).length > 0 &&
      [template.system, template.user].some(
        (t) => expandSnippets(t, snippets).length > TEMPLATE_MAX,
      ),
  );

  const preview = $derived.by(() => {
    if (view !== 'preview') return null;
    try {
      return { ok: true as const, ...buildPreview(template, previewAs === 'explain') };
    } catch (err) {
      return { ok: false as const, reason: err instanceof Error ? err.message : String(err) };
    }
  });
  const contextNote = $derived(sendsPageContext || readsPageContext(template, snippets));

  function set(field: 'system' | 'user', value: string): void {
    onChange({ ...template, [field]: value });
  }

  async function insert(token: string): Promise<void> {
    const field = token === '{{text}}' ? 'user' : lastField;
    const el = field === 'system' ? sysEl : usrEl;
    const cur = template[field];
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    set(field, cur.slice(0, start) + token + cur.slice(end));
    await tick();
    const caret = start + token.length;
    el?.focus();
    el?.setSelectionRange(caret, caret);
  }

  // The button leaves with its block, so focus goes to Instructions instead of the dialog's X (K-9).
  async function useStandardFormat(): Promise<void> {
    if (stripped === null) return;
    set('system', stripped);
    await tick();
    sysEl?.focus();
  }

  // Arrow keys move between the two tabs and select (one Tab stop, like a radio group).
  function tabKeys(e: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    view = view === 'edit' ? 'preview' : 'edit';
    const root = (e.currentTarget as HTMLElement).closest('[role="tablist"]');
    void tick().then(() => root?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
  }

  const historyBudget = CHAT_HISTORY_TOKEN_BUDGET.toLocaleString('en-US');
</script>

<section class="pe" data-ega-prompt-editor={kind} aria-labelledby="{uid}-title">
  <div class="pe-head">
    <h3 class="pe-title" id="{uid}-title">Prompt</h3>
    <div class="pe-tabs" role="tablist" aria-label="Prompt view">
      <button
        type="button"
        role="tab"
        class="pe-tab"
        class:active={view === 'edit'}
        aria-selected={view === 'edit'}
        aria-controls={editPanelId}
        tabindex={view === 'edit' ? 0 : -1}
        data-ega-prompt-tab="edit"
        onclick={() => (view = 'edit')}
        onkeydown={tabKeys}>Edit</button
      >
      <button
        type="button"
        role="tab"
        class="pe-tab"
        class:active={view === 'preview'}
        aria-selected={view === 'preview'}
        aria-controls={previewPanelId}
        tabindex={view === 'preview' ? 0 : -1}
        data-ega-prompt-tab="preview"
        onclick={() => (view = 'preview')}
        onkeydown={tabKeys}>Preview</button
      >
    </div>
    {#if view === 'edit'}
      <span class="pe-insert">
        <VariablePicker {variables} {used} onInsert={(t) => void insert(t)} />
      </span>
    {/if}
  </div>

  {#if notice}{@render notice()}{/if}

  <!-- Hidden, not unmounted: switching back keeps the caret and scroll of the last field. -->
  <div class="pe-panel" role="tabpanel" id={editPanelId} hidden={view !== 'edit'}>
    <div class="pe-field" data-ega-template-system>
      <div class="pe-label-row">
        <label class="pe-label" for={sysId}>Instructions</label>
        {#if sysEdited}<span class="pe-edited" data-ega-prompt-edited="system">Edited</span>{/if}
      </div>
      <textarea
        id={sysId}
        class="pe-ta pe-ta-sys"
        bind:this={sysEl}
        dir="auto"
        value={template.system}
        maxlength={TEMPLATE_MAX}
        spellcheck="false"
        autocapitalize="off"
        {...{ autocorrect: 'off' }}
        placeholder={kind === 'custom' ? 'e.g. Turn it into a polite email reply' : undefined}
        oninput={(e) => set('system', e.currentTarget.value)}
        onfocus={() => (lastField = 'system')}></textarea>
      {#if tooLongWithSnippets}
        <p class="pe-warn" data-ega-snippet-warn>
          With its snippets written out, this prompt is longer than {TEMPLATE_MAX.toLocaleString(
            'en-US',
          )} characters, so Ega keeps the snippets until you shorten it
        </p>
      {/if}
    </div>

    <div class="pe-format" role="group" aria-labelledby="{uid}-fmt" data-ega-answer-format>
      <div class="pe-label-row">
        <span class="pe-label" id="{uid}-fmt">Answer format</span>
        <span class="pe-lock" aria-hidden="true"><Lock size={14} strokeWidth={1.75} /></span>
        <InfoTip
          label="About the answer format"
          text="Ega reads every answer in this format, so it is not part of the editable prompt. It is added after your instructions."
        />
      </div>
      {#if ownFormat}
        <div class="pe-format-own" data-ega-answer-format-own>
          <p class="pe-format-line">
            Your instructions include their own answer format, so Ega uses that one.
          </p>
          {#if stripped !== null}
            <Button
              variant="secondary"
              dataAttrs={{ 'data-ega-use-standard-format': true }}
              onclick={() => void useStandardFormat()}>Use the standard format</Button
            >
          {:else}
            <p class="pe-format-line" id="{uid}-fmt-why">
              Ega cannot take it out without leaving the instructions empty
            </p>
          {/if}
        </div>
      {:else}
        <pre class="pe-format-text">{formatText}</pre>
      {/if}
    </div>

    <div class="pe-field" data-ega-template-user>
      <div class="pe-label-row">
        <label class="pe-label" for={usrId}>Message</label>
        {#if usrEdited}<span class="pe-edited" data-ega-prompt-edited="user">Edited</span>{/if}
      </div>
      <textarea
        id={usrId}
        class="pe-ta pe-ta-usr"
        bind:this={usrEl}
        dir="auto"
        value={template.user}
        maxlength={TEMPLATE_MAX}
        spellcheck="false"
        autocapitalize="off"
        {...{ autocorrect: 'off' }}
        aria-invalid={checks.messageError !== null ? 'true' : undefined}
        aria-describedby={checks.messageError !== null ? msgErrId : undefined}
        oninput={(e) => set('user', e.currentTarget.value)}
        onfocus={() => (lastField = 'user')}></textarea>
      {#if checks.messageError !== null}
        <p class="pe-error" id={msgErrId} data-ega-prompt-error>{checks.messageError}</p>
      {/if}
      {#each checks.warnings as w (w)}
        <p class="pe-warn" data-ega-slot-warn>{w}</p>
      {/each}
    </div>
  </div>

  <div
    class="pe-panel pe-preview"
    role="tabpanel"
    id={previewPanelId}
    hidden={view !== 'preview'}
    data-ega-compile-preview
  >
    <p class="pe-note">Shown with the sample text "{PREVIEW_SAMPLE_TEXT}" and your settings</p>
    {#if offersExplainPreview}
      <div class="pe-preview-as">
        <span class="pe-label" id="{uid}-as">Preview as</span>
        <Segmented
          value={previewAs}
          options={[
            { value: 'translate', label: 'Translate' },
            { value: 'explain', label: 'Explain' },
          ]}
          ariaLabelledby="{uid}-as"
          onchange={(v) => (previewAs = v)}
        />
      </div>
    {/if}
    {#if preview}
      <div class="pe-part">
        <h4 class="pe-label">System</h4>
        {#if preview.ok}
          <pre class="pe-pre" data-ega-preview-system>{preview.system}</pre>
          {#if contextNote}
            <p class="pe-note">
              Page context is empty here; on a page it adds the title, address and nearby text
            </p>
          {/if}
        {:else}
          <p class="pe-error">The preview could not be built: {preview.reason}</p>
        {/if}
      </div>
      <div class="pe-part" data-ega-preview-history>
        <h4 class="pe-label">Earlier messages</h4>
        <p class="pe-note">
          Side panel follow-ups add the recent conversation here, up to about {historyBudget} tokens
        </p>
      </div>
      {#if preview.ok}
        <div class="pe-part">
          <h4 class="pe-label">Message</h4>
          <pre class="pe-pre" data-ega-preview-user>{preview.user}</pre>
        </div>
      {/if}
    {/if}
  </div>
</section>

<style>
  .pe {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }
  .pe-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }
  .pe-title {
    margin: 0;
    font-size: var(--fs-base);
    font-weight: 600;
  }
  .pe-tabs {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
  }
  .pe-tab {
    min-height: 26px;
    padding: 0 var(--space-3);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-muted);
    font-family: var(--font-ui);
    font-size: var(--fs-base);
    cursor: pointer;
  }
  .pe-tab.active {
    background: var(--color-accent-bg-soft);
    box-shadow: inset 0 0 0 1px var(--color-accent);
    color: var(--color-fg);
    font-weight: 600;
  }
  .pe-tab:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
  .pe-insert {
    margin-inline-start: auto;
  }
  .pe-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .pe-panel[hidden] {
    display: none;
  }
  .pe-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .pe-label-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .pe-label {
    margin: 0;
    font-size: var(--fs-base);
    font-weight: 600;
    color: var(--color-fg);
  }
  .pe-edited {
    font-size: var(--fs-base);
    color: var(--color-muted);
  }
  .pe-lock {
    display: inline-flex;
    color: var(--color-muted);
  }
  /* Grows with the text: Instructions 6 to 16 lines, Message 4 to 10, then it scrolls inside. */
  .pe-ta {
    field-sizing: content;
    box-sizing: border-box;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    color: var(--color-fg);
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    resize: vertical;
  }
  .pe-ta:focus-visible {
    border-color: var(--color-accent);
  }
  .pe-ta[aria-invalid='true'] {
    border-color: var(--color-danger);
  }
  .pe-ta-sys {
    min-height: calc(6lh + 2 * var(--space-2) + 2px);
    max-height: calc(16lh + 2 * var(--space-2) + 2px);
  }
  .pe-ta-usr {
    min-height: calc(4lh + 2 * var(--space-2) + 2px);
    max-height: calc(10lh + 2 * var(--space-2) + 2px);
  }
  .pe-format {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .pe-format-text,
  .pe-pre {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
    color: var(--color-fg);
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    line-height: var(--lh-body);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .pe-format-own {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
  }
  .pe-format-line,
  .pe-note {
    margin: 0;
    max-inline-size: 80ch;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .pe-error {
    margin: 0;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-danger-fg);
  }
  .pe-warn {
    margin: 0;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-warning-fg);
  }
  .pe-preview-as {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .pe-part {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
</style>
