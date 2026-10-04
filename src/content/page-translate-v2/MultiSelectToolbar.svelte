<script lang="ts">
  import type { RenderMode } from './store';
  import { isUserGesture } from '../user-gesture';

  interface Props {
    mode: RenderMode;
    onTranslate: () => void;
    onModeSelect: (mode: RenderMode) => void;
    onExit: () => void;
  }
  // multi-select.ts patches count / disabled / aria-pressed in place, so props stay static after mount.
  let { mode, onTranslate, onModeSelect, onExit }: Props = $props();

  // Translate starts requests and a mode pick writes a setting, so a click the page dispatches is ignored.
  const translate = (e: Event): void => {
    if (isUserGesture(e)) onTranslate();
  };
  const selectMode = (next: RenderMode) => (e: Event) => {
    if (isUserGesture(e)) onModeSelect(next);
  };
</script>

<div class="ega-ms-toolbar" role="toolbar" aria-label="Translate areas">
  <span class="ega-ms-live" data-ega-ms-live role="status" aria-live="polite"></span>
  <span class="count" data-ega-ms-count>No areas selected</span>
  <div class="modes" role="group" aria-label="How to show the translation">
    <button
      type="button"
      data-ega-ms-mode="inplace"
      aria-pressed={mode === 'inplace'}
      onclick={selectMode('inplace')}
    >
      Replace text
    </button>
    <button
      type="button"
      data-ega-ms-mode="bilingual"
      aria-pressed={mode === 'bilingual'}
      onclick={selectMode('bilingual')}
    >
      Show both
    </button>
  </div>
  <button type="button" class="translate" data-ega-ms-translate disabled onclick={translate}>
    Translate
  </button>
  <button
    type="button"
    class="exit"
    data-ega-ms-exit
    aria-label="Exit without translating"
    onclick={onExit}
  >
    ✕
  </button>
  <span class="hint">
    Click or <kbd>↑↓</kbd> to move · <kbd>Tab</kbd> next · <kbd>Space</kbd> picks ·
    <kbd>M</kbd> switches Replace text / Show both · <kbd>Enter</kbd> translates · <kbd>Esc</kbd> exits
  </span>
</div>
