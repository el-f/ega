<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { isFieldModified } from '@/shared/settings-registry';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import ShortcutInput from '@/shared/components/ShortcutInput.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import SettingHint from '@/options/components/SettingHint.svelte';
  import { validateKeyCombo } from '@/shared/utils/keyCombo';
  import { toastStore } from '@/shared/components/toastStore';

  const SHORTCUTS_URL = 'chrome://extensions/shortcuts';
  const OPEN_FAILED = `Could not open Chrome shortcuts. Type ${SHORTCUTS_URL} in the address bar.`;
  function openChromeShortcuts(): void {
    // The warning stays until closed (X14), so another try closes the last one's first.
    toastStore.close(OPEN_FAILED);
    chrome.tabs.create({ url: SHORTCUTS_URL }).catch(() => {
      toastStore.push({ message: OPEN_FAILED, variant: 'warning' });
    });
  }

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<unknown> | void;
  }
  const { s, onPatch }: Props = $props();

  function comboError(value: string | undefined): string | null {
    if (!value?.trim()) return null;
    const r = validateKeyCombo(value);
    return r.ok ? null : r.error;
  }
  const shortcutErr = $derived(comboError(s.shortcut));
  const pickerShortcutErr = $derived(comboError(s.pickerShortcut));

  /** A combo the other shortcut already uses is not saved; the row says which one has it. */
  let clash = $state<{ row: 'picker' | 'shortcut'; message: string } | null>(null);
  function setShortcut(row: 'picker' | 'shortcut', next: string): void {
    const other = row === 'picker' ? s.shortcut : s.pickerShortcut;
    if (next !== '' && next === other) {
      const name = row === 'picker' ? 'Translate selection' : 'Element picker';
      clash = { row, message: `${next} is already the ${name} shortcut. Pick another.` };
      return;
    }
    clash = null;
    void onPatch(row === 'picker' ? { pickerShortcut: next } : { shortcut: next });
  }
</script>

<SectionCard
  title="Element picker and shortcuts"
  description="Translate any part of a page, or the selection, from the keyboard"
  info={{
    label: 'About shortcuts',
    text: 'These shortcuts work while a web page has focus. The shortcut that opens Ega anywhere in Chrome is set on the Chrome shortcuts page.',
  }}
>
  <div class="picker-toggle" data-ega-setting="display.pickerEnabled">
    <Checkbox
      id="dsp-picker-enabled"
      label="Turn on the element picker"
      checked={s.pickerEnabled}
      describedBy="dsp-picker-hint"
      modified={isFieldModified('display.pickerEnabled', s)}
      onchange={(next) => void onPatch({ pickerEnabled: next })}
    />
    <SettingHint setting="display.pickerEnabled" id="dsp-picker-hint" indent />
  </div>

  <div class="shortcuts">
    <div class="shortcut-row" data-ega-setting="display.pickerShortcut">
      <span class="shortcut-name"
        >Element picker{#if isFieldModified('display.pickerShortcut', s)}<span
            class="shortcut-changed"
            data-ega-modified="true">Changed</span
          >{/if}</span
      >
      <div class="shortcut-control">
        <ShortcutInput
          value={s.pickerShortcut ?? ''}
          ariaLabel="Record element picker shortcut"
          clearAriaLabel="Clear element picker shortcut"
          ariaDisabled={!s.pickerEnabled}
          {...s.pickerEnabled ? {} : { describedBy: 'dsp-picker-off' }}
          onchange={(next) => setShortcut('picker', next)}
        />
        {#if !s.pickerEnabled}
          <p class="shortcut-line" id="dsp-picker-off" data-ega-disabled-reason>
            Turn on the element picker to use this shortcut
          </p>
        {/if}
        {#if clash?.row === 'picker'}
          <p class="field-error" role="alert">{clash.message}</p>
        {:else if pickerShortcutErr}
          <p class="field-error" role="alert">{pickerShortcutErr}</p>
        {/if}
      </div>
    </div>

    <div class="shortcut-row" data-ega-setting="display.shortcut">
      <span class="shortcut-name"
        >Translate selection{#if isFieldModified('display.shortcut', s)}<span
            class="shortcut-changed"
            data-ega-modified="true">Changed</span
          >{/if}</span
      >
      <div class="shortcut-control">
        <ShortcutInput
          value={s.shortcut ?? ''}
          ariaLabel="Record keyboard shortcut"
          clearAriaLabel="Clear translate shortcut"
          onchange={(next) => setShortcut('shortcut', next)}
        />
        {#if clash?.row === 'shortcut'}
          <p class="field-error" role="alert">{clash.message}</p>
        {:else if shortcutErr}
          <p class="field-error" role="alert">{shortcutErr}</p>
        {/if}
      </div>
    </div>

    <div class="shortcut-row">
      <span class="shortcut-name">Open Ega</span>
      <div class="shortcut-control shortcut-chrome">
        <span class="shortcut-line">Set in Chrome</span>
        <Button variant="secondary" size="sm" iconKind="external-link" onclick={openChromeShortcuts}
          >Open Chrome shortcuts</Button
        >
      </div>
    </div>
  </div>
</SectionCard>

<style>
  .picker-toggle {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .shortcuts {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin-top: var(--space-3);
  }
  .shortcut-row {
    display: grid;
    grid-template-columns: 11rem minmax(0, 1fr);
    align-items: start;
    gap: var(--space-3);
  }
  .shortcut-name {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    font-size: var(--fs-base);
  }
  /* The same "Changed" word the shared controls show; the label column holds it here. */
  .shortcut-changed {
    margin-inline-start: var(--space-2);
    color: var(--color-muted);
  }
  .shortcut-control {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .shortcut-chrome {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  .shortcut-line {
    margin: 0;
    font-size: var(--fs-base);
    color: var(--color-muted);
  }
  @container options (max-width: 480px) {
    .shortcut-row {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-1);
    }
  }
</style>
