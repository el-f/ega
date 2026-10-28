<script lang="ts">
  /**
   * The one prompt editor (task dialog, custom task dialog, language dialog): Instructions, Message, an Insert
   * variable list and a Preview of the prompt as sent, with its reply format. It is controlled: the dialog owns
   * the draft, saving and reset.
   */
  import { tick, type Snippet } from 'svelte';
  import Button from '@/shared/ui/Button.svelte';
  import Segmented from '@/shared/ui/Segmented.svelte';
  import StableLabel from '@/shared/ui/StableLabel.svelte';
  import { CHAT_HISTORY_TOKEN_BUDGET } from '@/shared/chat-history';
  import { expandSnippets, SLOT_RE } from '@/shared/snippets';
  import { hasAnswerFormat, readsPageContext } from '@/shared/prompts';
  import { TEMPLATE_MAX } from '@/shared/settings-schema';
  import type { AnswerSpec } from '@/shared/answer/spec';
  import { renderFormat } from '@/shared/answer/render-format';
  import { hasConflictingFormat } from '@/shared/backends/structured-output';
  import { takeOutOwnFormat } from '@/options/own-answer-format';
  import type { PromptTemplate } from '@/shared/types';
  import { id as makeId } from '@/shared/uuid';
  import { PREVIEW_SAMPLE_TEXT } from '@/options/preview-prompt';
  import VariablePicker from './VariablePicker.svelte';
  import { checkPrompt, splitReplyFormat, variablesFor, type PromptKind } from './prompt-checks';

  interface Props {
    kind: PromptKind;
    /** A built-in task, or a custom task's id. */
    task: string;
    /** The live draft. */
    template: PromptTemplate;
    /** The shipped prompt to compare with ("Edited"); null when there is none (a custom task). */
    builtIn: PromptTemplate | null;
    /** A built-in prompt's reply spec, whose format Ega adds unless the prompt holds its own. */
    spec?: AnswerSpec | undefined;
    /** A custom task's notice under Instructions, shown while its prompt asks for its own format. */
    formatNotice?: Snippet | undefined;
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
    spec,
    formatNotice,
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

  // Holding Ega's marker, the prompt is sent with only its own format; any other own format is sent next to Ega's.
  const keepsOwn = $derived(spec !== undefined && hasAnswerFormat(template.system, snippets));
  const ownFormat = $derived(
    spec !== undefined && (keepsOwn || hasConflictingFormat(template, spec)),
  );
  const takenOut = $derived(
    spec !== undefined && ownFormat ? takeOutOwnFormat(template, renderFormat(spec)) : null,
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
      const built = buildPreview(template, previewAs === 'explain');
      return {
        ok: true as const,
        user: built.user,
        ...(keepsOwn ? { system: built.system, format: null } : splitReplyFormat(built.system)),
      };
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

  // The button leaves with its notice, so focus goes to Instructions instead of the dialog's X (K-9).
  async function useEgaFormat(): Promise<void> {
    if (takenOut === null || takenOut === 'empty') return;
    onChange(takenOut);
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
        onkeydown={tabKeys}><StableLabel current="Edit" labels={['Edit']} /></button
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
        onkeydown={tabKeys}><StableLabel current="Preview" labels={['Preview']} /></button
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
      {#if ownFormat}
        <div class="pe-format-own" data-ega-answer-format-own>
          <p class="pe-format-line">
            Your instructions ask for their own format. Ega reads only the parts under Reply.
          </p>
          {#if takenOut === 'empty'}
            <p class="pe-format-line">
              Ega cannot take it out without leaving the instructions empty
            </p>
          {:else if takenOut !== null}
            <Button
              variant="secondary"
              size="sm"
              dataAttrs={{ 'data-ega-use-standard-format': true }}
              onclick={() => void useEgaFormat()}>Use Ega's format</Button
            >
          {/if}
        </div>
      {:else if formatNotice}
        <div class="pe-format-own" data-ega-answer-format-own>{@render formatNotice()}</div>
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
      {#if preview.ok && preview.format}
        <div class="pe-part">
          <h4 class="pe-label">Reply format</h4>
          <pre class="pe-pre" data-ega-preview-format>{preview.format}</pre>
        </div>
      {/if}
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
    font-weight: 600; /* hover-lint-allow: the sizer below holds the bold width */
  }
  /* Each tab holds its label's bold width, like Segmented, so a pick does not move the tab beside it (R63). */
  .pe-tab :global(.ega-stable > [data-label]) {
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
