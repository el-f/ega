<script lang="ts">
  import type { Settings } from '@/shared/types';
  import { isFieldModified } from '@/shared/settings-registry';
  import SectionCard from '@/shared/ui/SectionCard.svelte';
  import Checkbox from '@/shared/ui/Checkbox.svelte';
  import CollapsibleField from '@/shared/ui/CollapsibleField.svelte';
  import ShortcutInput from '@/shared/components/ShortcutInput.svelte';
  import { validateKeyCombo } from '@/shared/utils/keyCombo';

  interface Props {
    s: Settings;
    onPatch: (p: Partial<Settings>) => Promise<void> | void;
  }
  const { s, onPatch }: Props = $props();

  const shortcutErr = $derived.by(() => {
    if (!s.shortcut?.trim()) return null;
    const r = validateKeyCombo(s.shortcut);
    return r.ok ? null : r.error;
  });
  const pickerShortcutErr = $derived.by(() => {
    if (!s.pickerShortcut?.trim()) return null;
    const r = validateKeyCombo(s.pickerShortcut);
    return r.ok ? null : r.error;
  });
</script>

<SectionCard
  title="Element picker & shortcut"
  description="Click any element to translate it, or translate the selection with a keyboard shortcut."
>
  <div class="row" data-ega-setting="display.pickerEnabled">
    <Checkbox
      id="dsp-picker-enabled"
      label="Enable element picker"
      checked={s.pickerEnabled}
      modified={isFieldModified('display.pickerEnabled', s)}
      onchange={(next) => void onPatch({ pickerEnabled: next })}
    />
  </div>

  <CollapsibleField open={s.pickerEnabled}>
    <div data-ega-setting="display.pickerShortcut">
      <ShortcutInput
        value={s.pickerShortcut ?? ''}
        label="Element picker shortcut"
        ariaLabel="Record element picker shortcut"
        clearAriaLabel="Clear element picker shortcut"
        modified={isFieldModified('display.pickerShortcut', s)}
        onchange={(next) => void onPatch({ pickerShortcut: next })}
      />
      {#if pickerShortcutErr}
        <p class="field-error" role="alert">{pickerShortcutErr}</p>
      {/if}
      <div class="help">
        Hover any element to outline it, click to translate. Esc cancels. Also available from the
        right-click menu and the toolbar popup.
      </div>
    </div>
  </CollapsibleField>

  <div data-ega-setting="display.shortcut">
    <ShortcutInput
      value={s.shortcut ?? ''}
      label="Translate shortcut"
      ariaLabel="Record keyboard shortcut"
      clearAriaLabel="Clear translate shortcut"
      modified={isFieldModified('display.shortcut', s)}
      onchange={(next) => void onPatch({ shortcut: next })}
    />
    {#if shortcutErr}
      <p class="field-error" role="alert">{shortcutErr}</p>
    {/if}
    <div class="help">
      Ega's browser-wide shortcut is set at chrome://extensions/shortcuts. This one only works while
      a web page has focus.
    </div>
  </div>
</SectionCard>
