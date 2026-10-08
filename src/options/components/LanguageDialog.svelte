<script lang="ts">
  /** One language in a dialog: name (custom only), notes, examples, picker visibility, the detect pattern and its prompt. Each field saves as it changes. */
  import { onDestroy, tick, untrack } from 'svelte';
  import Trash from '@lucide/svelte/icons/trash-2';
  import Download from '@lucide/svelte/icons/download';
  import X from '@lucide/svelte/icons/x';
  import type { PromptTemplate, Settings, Variety, VarietyEdit } from '@/shared/types';
  import {
    CUSTOM_LANG_EXAMPLES_MAX,
    DETECT_FLAGS_MAX,
    DETECT_PATTERN_MAX,
    VARIETY_EXAMPLE_MAX,
    VARIETY_EXAMPLES_MAX,
    VARIETY_HINT_MAX,
    VARIETY_LABEL_MAX,
  } from '@/shared/settings-schema';
  import { answerFormatFor } from '@/shared/task-prompts';
  import { languagePrompt } from '@/shared/language-prompt';
  import { addCustomVariety, listVarieties, resetVariety, updateVariety } from '@/shared/varieties';
  import { replaceSettings } from '@/shared/storage';
  import { exportLanguage } from '@/shared/storage/backup';
  import { downloadJsonFile } from '@/shared/download-file';
  import { buildPreviewPrompt, PREVIEW_SAMPLE_TEXT } from '@/options/preview-prompt';
  import { reportSaveFailure } from '@/options/storage-with-toast';
  import { confirmDialog } from '@/shared/components/confirmDialog';
  import { toastStore } from '@/shared/components/toastStore';
  import {
    clearLanguagePrompt,
    restoreLanguagePrompt,
    saveLanguagePrompt,
  } from '@/options/language-prompt-store';
  import { deleteLanguage, restoreLanguage } from '@/options/language-undo';
  import PromptEditor from '@/options/components/prompt/PromptEditor.svelte';
  import { checkPrompt } from '@/options/components/prompt/prompt-checks';
  import SectionReset from '@/options/components/SectionReset.svelte';
  import DialogStatus from '@/options/components/DialogStatus.svelte';
  import Disclosure from '@/options/components/Disclosure.svelte';
  import {
    confirmCloseWithout,
    createDialogSaver,
    NotSavedError,
  } from '@/options/components/dialog-saver.svelte';
  import Dialog from '@/shared/ui/Dialog.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import IconButton from '@/shared/ui/IconButton.svelte';
  import Input from '@/shared/ui/Input.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import RadioGroup from '@/shared/ui/RadioGroup.svelte';
  import InfoTip from '@/shared/ui/InfoTip.svelte';
  import { id as makeId } from '@/shared/uuid';

  interface Props {
    s: Settings;
    /** The language being edited; null for a new one. */
    language: Variety | null;
    onClose: () => void;
    /** After a write: the settings when they changed (null when only the language rows did). */
    onSaved: (next: Settings | null) => void;
  }

  const { s, language, onClose, onSaved }: Props = $props();

  type Example = { src: string; tgt: string };
  type Field = 'label' | 'hint' | 'examples' | 'autoDetect';

  const uid = makeId('ega-language');
  // The dialog edits a copy: a write that lands later never overwrites what is being typed.
  const initial = untrack(() => language);
  const isCustom = initial === null || initial.kind === 'custom';
  let langId = $state<string | null>(initial?.id ?? null);
  let name = $state(initial?.label ?? '');
  let notes = $state(initial?.hint ?? '');
  let examples = $state<Example[]>(initial ? initial.examples.map((e) => ({ ...e })) : []);
  let shown = $state(initial ? !initial.disabled : true);
  let detect = $state({
    regex: initial?.autoDetect?.regex ?? '',
    flags: initial?.autoDetect?.flags ?? 'i',
    min: String(initial?.autoDetect?.minScore ?? 1),
  });
  let detectError = $state<string | null>(null);
  let edited = $state(initial?.hasOverrides ?? false);
  let conflict = $state(false);
  let gone = $state(false);
  let promptMode = $state<'translate' | 'own'>(
    untrack(() =>
      initial && Object.hasOwn(s.advanced.perPresetTemplates, initial.id) ? 'own' : 'translate',
    ),
  );
  let promptDraft = $state<PromptTemplate>(
    untrack(() => (initial ? languagePrompt(s, initial.id) : s.advanced.promptTemplate)),
  );

  const exampleCap = isCustom ? CUSTOM_LANG_EXAMPLES_MAX : VARIETY_EXAMPLES_MAX;
  const saver = createDialogSaver();
  onDestroy(() => saver.dispose());

  let varieties = $state.raw<Variety[]>([]);
  void listVarieties({ enabledOnly: false }).then((vs) => (varieties = vs));

  /** Blank example rows are not stored. */
  function keptExamples(list: readonly Example[]): Example[] {
    return list.filter((e) => e.src.trim() !== '' || e.tgt.trim() !== '');
  }

  /** The stored form of each field, to tell "changed in another window" from "changed here". */
  function storedKey(v: Variety, field: Field): string {
    if (field === 'label') return v.label;
    if (field === 'hint') return v.hint;
    if (field === 'examples') return JSON.stringify(v.examples.map((e) => [e.src, e.tgt]));
    return JSON.stringify(v.autoDetect ?? null);
  }
  function draftKey(field: Field, value: VarietyEdit[keyof VarietyEdit] | string): string {
    if (field === 'examples')
      return JSON.stringify((value as Example[]).map((e) => [e.src, e.tgt]));
    if (field === 'autoDetect') return JSON.stringify(value ?? null);
    return String(value);
  }
  // What this dialog last read or wrote for each field.
  let base = untrack(() =>
    initial
      ? {
          label: storedKey(initial, 'label'),
          hint: storedKey(initial, 'hint'),
          examples: storedKey(initial, 'examples'),
          autoDetect: storedKey(initial, 'autoDetect'),
        }
      : null,
  );

  async function stored(): Promise<Variety | undefined> {
    return (await listVarieties()).find((v) => v.id === langId);
  }

  /** One field of an existing language; another window's change to the same field stops it. */
  async function writeField(field: Field, patch: VarietyEdit): Promise<void> {
    const id = langId;
    if (id === null || base === null) return;
    const cur = await stored();
    if (!cur) {
      gone = true;
      throw new NotSavedError('it was deleted in another window');
    }
    if (storedKey(cur, field) !== base[field]) {
      conflict = true;
      throw new NotSavedError('it changed in another window');
    }
    try {
      await updateVariety(id, patch);
    } catch (e) {
      if (e instanceof Error && e.message === 'slow-pattern') {
        detectError =
          'This pattern can take too long on a long selection, so it was not saved. Use fewer repeats like .* or \\w+';
        throw new NotSavedError('the pattern is too slow', { cause: e });
      }
      if (e instanceof Error && e.message === 'language-gone') {
        gone = true;
        throw new NotSavedError('it was deleted in another window', { cause: e });
      }
      throw e;
    }
    const fresh = await stored();
    if (fresh) {
      base[field] = storedKey(fresh, field);
      edited = fresh.hasOverrides;
    }
    onSaved(null);
  }

  const INVALID_PATTERN = 'This pattern is not valid. Check the brackets and slashes.';
  const TEXT_FIELDS: readonly Field[] = ['label', 'hint', 'examples', 'autoDetect'];
  const FIELD_NAMES: Record<Field | 'prompt', string> = {
    label: 'the name',
    hint: 'the notes',
    examples: 'the examples',
    autoDetect: 'the auto-detect pattern',
    prompt: 'the message',
  };

  /** Why a text field cannot be saved as typed, in the status line's words; null when it can. */
  function problemOf(field: Field): string | null {
    if (field === 'label') return isCustom && name.trim() === '' ? 'add a name' : null;
    if (field === 'hint') return isCustom && notes.trim() === '' ? 'add notes' : null;
    if (field === 'autoDetect') {
      return detectPatch() instanceof Error ? 'the pattern is not valid' : null;
    }
    return null;
  }

  /** What a new custom language still needs before it is created. */
  const missing = $derived(problemOf('label') ?? problemOf('hint'));

  // One create at a time: a second save while the first runs waits for the same id.
  let creating: Promise<void> | null = null;
  async function create(): Promise<void> {
    creating ??= (async () => {
      if (missing !== null) throw new NotSavedError(missing);
      const added = await addCustomVariety({
        label: name.trim(),
        hint: notes.trim(),
        examples: keptExamples(examples),
      });
      langId = added.id;
      base = {
        label: storedKey(added, 'label'),
        hint: storedKey(added, 'hint'),
        examples: storedKey(added, 'examples'),
        autoDetect: storedKey(added, 'autoDetect'),
      };
      if (!shown) onSaved(await writeShown(added.id, false));
      onSaved(null);
    })();
    try {
      await creating;
    } finally {
      creating = null;
    }
  }

  const ERRORS: Record<string, string> = {
    'cap-reached': 'you have the most languages Ega keeps (200); delete one to add another',
    'invalid-language': 'the name or the notes are not valid',
  };
  /** A named reason reads in the footer; anything else is a storage failure the saver words. */
  function named(e: unknown): unknown {
    const known = e instanceof Error ? ERRORS[e.message] : undefined;
    return known === undefined ? e : new NotSavedError(known, { cause: e });
  }

  /** The stored form of a text field as typed now. */
  function patchOf(field: Field): VarietyEdit {
    if (field === 'label') return { label: name.trim() };
    if (field === 'hint') return { hint: notes.trim() };
    if (field === 'examples') return { examples: keptExamples(examples) };
    const pattern = detectPatch();
    if (pattern instanceof Error) throw new NotSavedError('the pattern is not valid');
    // A named undefined clears the pattern; the key is what tells it from "keep".
    return { autoDetect: pattern };
  }

  /** Writes one text field when it differs from what this dialog last read or wrote. */
  async function writeText(field: Field): Promise<void> {
    if (base === null) return;
    const patch = patchOf(field);
    if (draftKey(field, patch[field]) === base[field]) return;
    try {
      await writeField(field, patch);
    } catch (e) {
      throw named(e);
    }
  }

  /** The first save of a new language creates it; text typed while that ran, and the pattern, are written next. */
  async function createWithText(): Promise<void> {
    try {
      await create();
    } catch (e) {
      throw named(e);
    }
    for (const field of TEXT_FIELDS) {
      const problem = problemOf(field);
      if (problem !== null) saver.invalid(field, problem);
      else await writeText(field);
    }
  }

  /** Each text field saves on its own once typing pauses; one that is not valid is held back and named. */
  function saveText(field: Field): void {
    if (field === 'autoDetect') {
      detectError = detectPatch() instanceof Error ? INVALID_PATTERN : null;
    }
    if (langId === null) {
      // A new language is created once it has a name and notes; until then the idle line says what it needs.
      if (missing === null) saver.later('create', createWithText);
      return;
    }
    const problem = problemOf(field);
    if (problem !== null) saver.invalid(field, problem);
    else saver.later(field, () => writeText(field));
  }

  function setExamples(next: Example[]): void {
    examples = next;
    saveText('examples');
  }

  // Removing the last row takes its button away, so focus goes to the row above, else to Add example.
  async function removeExample(i: number): Promise<void> {
    setExamples(examples.filter((_, j) => j !== i));
    if (i < examples.length) return;
    await tick();
    (
      document.querySelector<HTMLElement>(`[data-ega-language-example="${i - 1}"] button`) ??
      document.querySelector<HTMLElement>('[data-ega-language-add-example]')
    )?.focus();
  }

  /** Undefined clears the pattern (a built-in then runs its shipped one); an Error is a pattern the browser cannot compile. */
  function detectPatch(): VarietyEdit['autoDetect'] | Error {
    if (detect.regex.trim() === '') return undefined;
    try {
      new RegExp(detect.regex, detect.flags);
    } catch (e) {
      return e as Error;
    }
    return {
      regex: detect.regex,
      flags: detect.flags,
      minScore: Math.max(1, Math.round(Number(detect.min)) || 1),
    };
  }

  function writeShown(id: string, on: boolean): Promise<Settings> {
    return replaceSettings((cur) => ({
      ...cur,
      disabledVarieties: on
        ? cur.disabledVarieties.filter((x) => x !== id)
        : [...new Set([...cur.disabledVarieties, id])],
    }));
  }

  async function setShown(on: boolean): Promise<void> {
    shown = on;
    const id = langId;
    // A new language takes this when it is created.
    if (id === null) return;
    await saver.now(async () => onSaved(await writeShown(id, on)));
  }

  // Prompt: the Translate prompt, or the language's own one.
  const promptInvalid = $derived(
    promptMode === 'own' && checkPrompt(promptDraft, 'language', 'translate').messageError !== null,
  );

  function onPromptChange(next: PromptTemplate): void {
    promptDraft = next;
    const id = langId;
    if (id === null) return;
    if (checkPrompt(next, 'language', 'translate').messageError !== null) {
      saver.invalid('prompt', 'the message needs the Selected text variable');
      return;
    }
    saver.later('prompt', async () => onSaved(await saveLanguagePrompt(id, next)));
  }

  async function setPromptMode(mode: 'translate' | 'own'): Promise<void> {
    const id = langId;
    if (id === null || mode === promptMode) return;
    promptMode = mode;
    if (mode === 'own') {
      // Starts from the prompt the language runs now, which is the Translate prompt.
      promptDraft = languagePrompt(s, id);
      return;
    }
    let removed: Awaited<ReturnType<typeof clearLanguagePrompt>>['removed'];
    const ok = await saver.now(async () => {
      const out = await clearLanguagePrompt(id);
      removed = out.removed;
      onSaved(out.settings);
    });
    if (!ok || removed === undefined) return;
    const prior = removed;
    saver.note('Uses the Translate prompt', () => {
      void saver
        .now(async () => onSaved(await restoreLanguagePrompt(id, prior)))
        .then((back) => {
          if (!back) return;
          promptMode = 'own';
          promptDraft = {
            system: prior.system ?? s.advanced.promptTemplate.system,
            user: prior.user ?? s.advanced.promptTemplate.user,
          };
          saver.note('Its own prompt is back');
        });
    });
  }

  /** Reloads every field from storage, after another window changed one. */
  async function reload(): Promise<void> {
    const cur = await stored();
    if (!cur) {
      gone = true;
      return;
    }
    saver.discard();
    name = cur.label;
    notes = cur.hint;
    examples = cur.examples.map((e) => ({ ...e }));
    shown = !cur.disabled;
    detect = {
      regex: cur.autoDetect?.regex ?? '',
      flags: cur.autoDetect?.flags ?? 'i',
      min: String(cur.autoDetect?.minScore ?? 1),
    };
    detectError = null;
    edited = cur.hasOverrides;
    base = {
      label: storedKey(cur, 'label'),
      hint: storedKey(cur, 'hint'),
      examples: storedKey(cur, 'examples'),
      autoDetect: storedKey(cur, 'autoDetect'),
    };
    conflict = false;
    saver.note('Loaded the saved version');
  }

  // Built-in only: puts back the shipped notes, examples and pattern, with Undo in the status.
  async function reset(): Promise<void> {
    const id = langId;
    const cur = await stored();
    if (id === null || !cur) return;
    saver.discard();
    const prior: VarietyEdit = {
      hint: cur.hint,
      examples: cur.examples.map((e) => ({ ...e })),
      ...(cur.autoDetect ? { autoDetect: { ...cur.autoDetect } } : {}),
    };
    const ok = await saver.now(async () => {
      await resetVariety(id);
      onSaved(null);
    });
    if (!ok) return;
    await reload();
    saver.note('Back to built-in', () => {
      void saver
        .now(async () => {
          await updateVariety(id, prior);
          onSaved(null);
        })
        .then(async (back) => {
          if (!back) return;
          await reload();
          saver.note('Your edits are back');
        });
    });
    await tick();
    document
      .getElementById(`${uid}-foot`)
      ?.querySelector<HTMLElement>('[data-ega-dialog-undo]')
      ?.focus();
  }

  async function remove(): Promise<void> {
    const id = langId;
    if (id === null) return;
    const label = name.trim() || (initial?.label ?? '');
    saver.discard();
    const out = await deleteLanguage(id).catch((e: unknown) => {
      saver.invalid('row', e instanceof Error ? e.message : String(e));
      return undefined;
    });
    if (out === undefined) return;
    // Read before onClose: the props of an unmounted component are gone by the time Undo runs.
    const saved = onSaved;
    saved(null);
    onClose();
    toastStore.push({
      message: `Deleted "${label}"`,
      variant: 'success',
      ...(out
        ? {
            action: {
              label: 'Undo',
              onClick: () =>
                void restoreLanguage(out)
                  .then((next) => saved(next))
                  .catch((e: unknown) => reportSaveFailure(e)),
            },
          }
        : {}),
    });
  }

  async function exportOne(): Promise<void> {
    const id = langId;
    if (id === null) return;
    const label = name.trim();
    // The file holds what is stored, so what was typed a moment ago is saved first.
    await saver.flush();
    try {
      const bundle = await exportLanguage(id);
      const slug = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      downloadJsonFile(
        `ega-language-${slug || 'custom'}-${new Date().toISOString().slice(0, 10)}.json`,
        bundle,
      );
      saver.note('Exported to a file');
    } catch (e) {
      if (e instanceof Error && e.message === 'language-gone') gone = true;
      saver.invalid('export', 'the language could not be exported');
    }
  }

  const hasText = $derived(
    name.trim() !== '' || notes.trim() !== '' || keptExamples(examples).length > 0,
  );
  let closing = false;
  // Done, Esc, the x and a click outside all save what is waiting, then close.
  async function close(): Promise<void> {
    if (closing) return;
    closing = true;
    try {
      await saver.flush();
      if (langId === null && hasText) {
        const discard = await confirmDialog({
          title: 'Discard this language?',
          body: 'You started a language and it is not saved yet.',
          confirmLabel: 'Discard',
          cancelLabel: 'Keep editing',
        });
        if (!discard) return;
      } else if (langId !== null && !gone) {
        const fields = TEXT_FIELDS.filter((f) =>
          f === 'autoDetect' ? detectError !== null : problemOf(f) !== null,
        ).map((f) => FIELD_NAMES[f]);
        if (promptInvalid) fields.push(FIELD_NAMES.prompt);
        if (!(await confirmCloseWithout(fields))) return;
      }
      onClose();
    } finally {
      closing = false;
    }
  }

  function preview(tpl: PromptTemplate, explain: boolean): { system: string; user: string } {
    const id = langId ?? 'auto';
    return buildPreviewPrompt(s, {
      task: 'translate',
      explain,
      template: tpl,
      text: PREVIEW_SAMPLE_TEXT,
      sourceLang: id as Parameters<typeof buildPreviewPrompt>[1]['sourceLang'],
      targetLang: s.defaultTargetLang ?? 'en',
      varieties,
    });
  }

  const idleText = $derived(langId === null ? `Not saved yet: ${missing ?? 'add a name'}` : '');
  const detectInfo = isCustom
    ? 'When the source is Auto-detect, Ega picks this language if the pattern matches the text at least the minimum number of times. Leave it empty to turn detection off.'
    : 'When the source is Auto-detect, Ega picks this language if the pattern matches the text at least the minimum number of times. Leave it empty to use the built-in pattern.';
</script>

<Dialog
  open
  title={initial ? `Edit ${initial.label}` : 'New language'}
  focusTitle
  onClose={() => void close()}
  size="lg"
>
  <!-- A text field also saves when focus leaves it. -->
  <div
    class="language"
    data-ega-language-dialog={initial?.id ?? 'new'}
    onfocusout={() => void saver.flush()}
  >
    {#if conflict}
      <div class="ld-alert" role="alert" data-ega-language-conflict>
        <div>
          <p class="ld-alert-title">Changed in another window</p>
          <p>Your last change was not saved. Copy what you need, then reload the language.</p>
        </div>
        <Button variant="secondary" onclick={() => void reload()}>Reload language</Button>
      </div>
    {:else if gone}
      <div class="ld-alert" role="alert">
        <p class="ld-alert-title">This language was deleted in another window</p>
        <Button variant="secondary" onclick={onClose}>Close</Button>
      </div>
    {/if}

    <div class="ld-grid">
      {#if isCustom}
        <label class="ld-label" for="{uid}-name">Name</label>
        <Input
          id="{uid}-name"
          value={name}
          maxlength={VARIETY_LABEL_MAX}
          dataAttrs={{ 'data-ega-language-name': true }}
          oninput={(e) => {
            name = (e.currentTarget as HTMLInputElement).value;
            saveText('label');
          }}
        />
      {/if}

      <label class="ld-label" for="{uid}-notes">Notes</label>
      <div class="ld-control">
        <textarea
          id="{uid}-notes"
          class="ld-notes"
          dir="auto"
          maxlength={VARIETY_HINT_MAX}
          aria-describedby="{uid}-notes-hint {uid}-notes-count"
          data-ega-language-notes
          value={notes}
          oninput={(e) => {
            notes = (e.currentTarget as HTMLTextAreaElement).value;
            saveText('hint');
          }}></textarea>
        <div class="ld-hint-row">
          <span class="ld-hint" id="{uid}-notes-hint"
            >What the model should know about this language</span
          >
          <span class="ld-count" id="{uid}-notes-count">{notes.length} / {VARIETY_HINT_MAX}</span>
        </div>
      </div>

      <!-- With rows, the label sits on the Original / Translation line, not centred in a 32px box. -->
      <span class="ld-label" class:ld-label-flush={examples.length > 0} id="{uid}-examples"
        >Examples</span
      >
      <div class="ld-control" role="group" aria-labelledby="{uid}-examples">
        {#if examples.length > 0}
          <div class="ld-example-head" aria-hidden="true">
            <span>Original</span><span>Translation</span>
          </div>
        {/if}
        {#each examples as ex, i (i)}
          <div class="ld-example" data-ega-language-example={i}>
            <input
              type="text"
              dir="auto"
              maxlength={VARIETY_EXAMPLE_MAX}
              aria-label="Example {i + 1}, original"
              value={ex.src}
              oninput={(e) =>
                setExamples(
                  examples.map((x, j) =>
                    j === i ? { ...x, src: (e.currentTarget as HTMLInputElement).value } : x,
                  ),
                )}
            />
            <input
              type="text"
              dir="auto"
              maxlength={VARIETY_EXAMPLE_MAX}
              aria-label="Example {i + 1}, translation"
              value={ex.tgt}
              oninput={(e) =>
                setExamples(
                  examples.map((x, j) =>
                    j === i ? { ...x, tgt: (e.currentTarget as HTMLInputElement).value } : x,
                  ),
                )}
            />
            <IconButton
              icon={X}
              ariaLabel="Remove example {i + 1}"
              size="sm"
              onclick={() => void removeExample(i)}
            />
          </div>
        {/each}
        <div class="ld-add-example">
          <Button
            variant="ghost"
            size="sm"
            iconKind="add"
            ariaDisabled={examples.length >= exampleCap}
            {...examples.length >= exampleCap ? { describedBy: `${uid}-example-cap` } : {}}
            dataAttrs={{ 'data-ega-language-add-example': true }}
            onclick={async () => {
              examples = [...examples, { src: '', tgt: '' }];
              await tick();
              document
                .querySelector<HTMLInputElement>(
                  `[data-ega-language-example="${examples.length - 1}"] input`,
                )
                ?.focus();
            }}>Add example</Button
          >
          {#if examples.length >= exampleCap}
            <span class="ld-hint" id="{uid}-example-cap"
              >You have the most examples Ega keeps ({exampleCap})</span
            >
          {:else if isCustom && examples.length === 0}
            <span class="ld-hint">3 to 5 short pairs help the most</span>
          {/if}
        </div>
      </div>

      <span class="ld-label" aria-hidden="true"></span>
      <Checkbox
        label="Show in language pickers"
        checked={shown}
        inputAttrs={{ 'data-ega-language-shown': true }}
        onchange={(on) => void setShown(on)}
      />
    </div>

    <div class="ld-detect">
      <Disclosure label="Auto-detect pattern" dataAttrs={{ 'data-ega-language-detect': true }}>
        <div class="ld-detect-body">
          <!-- The (i) sits beside the field it explains, not alone on a row. -->
          <div class="ld-detect-head">
            <label class="ld-label" for="{uid}-pattern">Pattern</label>
            <InfoTip label="About the auto-detect pattern" text={detectInfo} />
          </div>
          <input
            id="{uid}-pattern"
            class="ld-mono"
            type="text"
            dir="ltr"
            spellcheck="false"
            autocomplete="off"
            maxlength={DETECT_PATTERN_MAX}
            aria-invalid={detectError !== null}
            aria-describedby={detectError !== null ? `${uid}-pattern-error` : undefined}
            value={detect.regex}
            oninput={(e) => {
              detect.regex = (e.currentTarget as HTMLInputElement).value;
              saveText('autoDetect');
            }}
          />
          {#if detectError}
            <p class="ld-error" id="{uid}-pattern-error">{detectError}</p>
          {/if}
          <div class="ld-detect-row">
            <div class="ld-detect-field">
              <label class="ld-label" for="{uid}-flags">Flags</label>
              <input
                id="{uid}-flags"
                class="ld-mono ld-flags"
                type="text"
                dir="ltr"
                spellcheck="false"
                autocomplete="off"
                maxlength={DETECT_FLAGS_MAX}
                aria-describedby="{uid}-flags-hint"
                value={detect.flags}
                oninput={(e) => {
                  detect.flags = (e.currentTarget as HTMLInputElement).value;
                  saveText('autoDetect');
                }}
              />
              <span class="ld-hint" id="{uid}-flags-hint">i ignores case</span>
            </div>
            <div class="ld-detect-field">
              <label class="ld-label" for="{uid}-min">Minimum matches</label>
              <input
                id="{uid}-min"
                class="ld-min"
                type="number"
                min="1"
                step="1"
                value={detect.min}
                oninput={(e) => {
                  detect.min = (e.currentTarget as HTMLInputElement).value;
                  saveText('autoDetect');
                }}
              />
            </div>
          </div>
        </div>
      </Disclosure>
    </div>

    {#if langId !== null}
      <div class="ld-prompt" data-ega-language-prompt>
        <span class="ld-label" id="{uid}-prompt">Prompt</span>
        <div class="ld-control ld-prompt-control">
          <RadioGroup
            value={promptMode}
            options={[
              { value: 'translate', label: 'Use the Translate prompt' },
              { value: 'own', label: 'Use its own prompt' },
            ]}
            orientation="horizontal"
            onValueChange={(v) => void setPromptMode(v === 'own' ? 'own' : 'translate')}
            dataAttrs={{
              'aria-labelledby': `${uid}-prompt`,
              'data-ega-language-prompt-mode': true,
            }}
          />
          {#if promptMode === 'own'}
            <PromptEditor
              kind="language"
              task="translate"
              template={promptDraft}
              builtIn={s.advanced.promptTemplate}
              format={answerFormatFor('translate')}
              snippets={s.advanced.snippets}
              sendsPageContext={s.contextEnabled}
              onChange={onPromptChange}
              buildPreview={preview}
            />
          {/if}
        </div>
      </div>
    {/if}
  </div>
  {#snippet actions()}
    <span class="ld-foot-start" id="{uid}-foot">
      {#if isCustom && langId !== null}
        <Button
          variant="ghost"
          leadingIcon={Trash}
          dataAttrs={{ 'data-ega-language-delete': true }}
          onclick={() => void remove()}>Delete language</Button
        >
        <Button
          variant="ghost"
          leadingIcon={Download}
          dataAttrs={{ 'data-ega-language-export': true }}
          onclick={() => void exportOne()}>Export</Button
        >
      {:else if !isCustom}
        <SectionReset
          modified={edited}
          label="Reset language"
          ariaLabel="Reset language"
          onReset={reset}
        />
      {/if}
      <DialogStatus status={saver.status} {idleText} />
    </span>
    <Button onclick={() => void close()} dataAttrs={{ 'data-ega-dialog-done': true }}>Done</Button>
  {/snippet}
</Dialog>

<style>
  /* One label column for the field rows and the Prompt row, so every control starts at the same edge. */
  .language {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: var(--space-5) var(--space-4);
  }
  .language > * {
    grid-column: 1 / -1;
  }
  .ld-grid,
  .ld-prompt {
    display: grid;
    grid-template-columns: subgrid;
    align-items: start;
    row-gap: var(--space-3);
  }
  .ld-label {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    margin: 0;
    font-size: var(--fs-base);
    font-weight: 600;
    opacity: 1;
  }
  .ld-control {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }
  .ld-label-flush {
    min-height: 0;
  }
  /* Grows with the text, so every note shows without an inner scroll. */
  .ld-notes {
    field-sizing: content;
    min-height: calc(3lh + var(--space-2) * 2);
    font-family: var(--font-ui);
    font-size: var(--fs-base);
    line-height: var(--lh-body);
  }
  .ld-hint-row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .ld-hint,
  .ld-count {
    font-size: var(--fs-base);
    color: var(--color-muted);
  }
  .ld-count {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
  }
  .ld-example-head,
  .ld-example {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 28px;
    gap: var(--space-2);
    align-items: center;
  }
  .ld-example-head {
    font-size: var(--fs-base);
    color: var(--color-muted);
  }
  .ld-add-example {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .ld-detect-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-block: var(--space-2);
  }
  .ld-detect-head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .ld-mono {
    font-family: var(--font-mono);
  }
  .ld-detect-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }
  .ld-detect-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .ld-flags {
    width: 8ch;
  }
  .ld-min {
    width: 9ch;
  }
  .ld-error {
    margin: 0;
    font-size: var(--fs-base);
    color: var(--color-danger-fg);
  }
  .ld-prompt {
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border-subtle);
  }
  .ld-prompt-control {
    gap: var(--space-3);
  }
  /* The row label already says Prompt; the editor's own title would repeat it. */
  .ld-prompt-control :global(.pe-title) {
    display: none;
  }
  .ld-alert {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-danger-fg);
    border-radius: var(--radius-md);
    color: var(--color-danger-fg);
    font-size: var(--fs-base);
  }
  .ld-alert p {
    margin: 0;
  }
  .ld-alert-title {
    font-weight: 600;
  }
  .ld-foot-start {
    margin-inline-end: auto;
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  @container options (max-width: 600px) {
    .language {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
