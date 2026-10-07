<script lang="ts">
  import { untrack } from 'svelte';
  import Popover from '@/shared/ui/Popover.svelte';
  import Button from '@/shared/ui/Button.svelte';
  import LanguagePicker from '@/shared/components/LanguagePicker.svelte';
  import type { Variety } from '@/shared/types';

  interface Props {
    /** The reply's Refine button. */
    anchor: HTMLElement | null;
    turnId: string;
    /** Where the select starts; it is read once, when the popover opens. */
    defaultLang: string;
    varieties: readonly Variety[];
    onClose: () => void;
    onTranslate: (lang: string) => void;
  }

  const { anchor, turnId, defaultLang, varieties, onClose, onTranslate }: Props = $props();

  // A language select commits on every arrow key; only the button runs the paid request.
  let lang = $state(untrack(() => defaultLang));
</script>

<Popover open={true} {anchor} {onClose} placement="bottom-start" title="Translate into">
  <div class="rm-into">
    <label class="rm-into-label" for="rm-into-{turnId}">Language</label>
    <LanguagePicker id="rm-into-{turnId}" {varieties} suppressAriaLabel bind:value={lang} />
    <Button
      variant="primary"
      size="sm"
      dataAttrs={{ 'data-ega-translate-into-run': 'true' }}
      onclick={() => {
        onClose();
        onTranslate(lang);
      }}>Translate</Button
    >
  </div>
</Popover>

<style>
  .rm-into {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    inline-size: min(260px, calc(100vw - 48px));
    font-size: var(--fs-sm);
  }
  .rm-into-label {
    font-weight: 600;
  }
  .rm-into :global(select) {
    min-block-size: 28px;
    padding-inline-end: var(--space-5);
  }
  .rm-into :global(.ega-btn) {
    align-self: flex-start;
  }
</style>
