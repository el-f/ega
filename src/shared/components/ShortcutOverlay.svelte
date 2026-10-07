<script lang="ts">
  import { Dialog } from 'bits-ui';
  import Kbd from '@/shared/ui/Kbd.svelte';
  import { isMacLike } from '@/shared/utils/platform';
  import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
  import { SETTINGS_TABS } from '@/shared/settings-tabs';

  interface Props {
    open: boolean;
    onClose: () => void;
    /** Gates the Options-only rows so other surfaces don't list chords they can't run. */
    surface?: 'options' | 'sidepanel';
    /** The user's live bindings. Both are rebindable in Options. */
    shortcut?: string | undefined;
    pickerShortcut?: string | undefined;
  }
  let {
    open,
    onClose,
    surface = 'options',
    shortcut = DEFAULT_SETTINGS.shortcut,
    pickerShortcut = DEFAULT_SETTINGS.pickerShortcut,
  }: Props = $props();
  const mac = isMacLike();
  const isOptions = $derived(surface === 'options');
  const isSidePanel = $derived(surface === 'sidepanel');
  // Alt+digit reaches only the tabs that exist.
  const lastTab = SETTINGS_TABS.length;

  // `matchShortcut` compares ctrlKey literally, so a stored Ctrl stays Ctrl on a Mac.
  const MOD_GLYPH: Readonly<Record<string, string>> = {
    ctrl: 'Ctrl',
    control: 'Ctrl',
    shift: 'Shift',
    alt: mac ? '⌥' : 'Alt',
    option: mac ? '⌥' : 'Alt',
    cmd: '⌘',
    command: '⌘',
    meta: '⌘',
  };

  function chordKeys(combo: string): string[] {
    return combo
      .split('+')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => MOD_GLYPH[p.toLowerCase()] ?? p);
  }
</script>

{#snippet chord(combo: string)}{#if chordKeys(combo).length === 0}<span class="shortcut-unset"
      >Not set</span
    >{:else}{#each chordKeys(combo) as k, i (i)}{#if i > 0}+{/if}<Kbd>{k}</Kbd
      >{/each}{/if}{/snippet}

{#if open}
  <button
    type="button"
    class="shortcut-backdrop"
    aria-label="Close keyboard shortcuts"
    onclick={onClose}
    onkeydown={(e) => {
      if (e.key === 'Escape') onClose();
    }}
  ></button>
  <Dialog.Root
    open={true}
    onOpenChange={(v) => {
      if (!v) onClose();
    }}
  >
    <!-- The content is the fixed panel: bits-ui gives it `contain: layout`, which would trap a fixed child at the page end.
         A short window scrolls the whole sheet, so arrow keys on the focused close button still scroll it. -->
    <Dialog.Content
      aria-label="Keyboard shortcuts"
      preventScroll={false}
      class="shortcut-panel"
      style="outline: none"
    >
      <div>
        <div class="shortcut-head">
          <h2>Keyboard shortcuts</h2>
          <button type="button" class="shortcut-close" aria-label="Close" onclick={onClose}
            >✕</button
          >
        </div>
        <dl class="shortcut-list">
          <div class="shortcut-row">
            <dt>Translate selection</dt>
            <dd>{@render chord(shortcut)}</dd>
          </div>
          <div class="shortcut-row">
            <dt>Start the element picker</dt>
            <dd>{@render chord(pickerShortcut)}</dd>
          </div>
          {#if isSidePanel}
            <div class="shortcut-row">
              <dt>Send</dt>
              <dd><Kbd>Enter</Kbd></dd>
            </div>
            <div class="shortcut-row">
              <dt>New line</dt>
              <dd><Kbd>Shift</Kbd>+<Kbd>Enter</Kbd></dd>
            </div>
            <div class="shortcut-row">
              <dt>Stop the reply</dt>
              <dd><Kbd>Esc</Kbd></dd>
            </div>
            <div class="shortcut-row">
              <dt>Move between messages</dt>
              <dd><Kbd>j</Kbd>/<Kbd>k</Kbd></dd>
            </div>
            <div class="shortcut-row">
              <dt>Jump to the message box</dt>
              <dd><Kbd>c</Kbd></dd>
            </div>
            <div class="shortcut-row">
              <dt>Edit your last message</dt>
              <dd><Kbd>e</Kbd></dd>
            </div>
            <div class="shortcut-row">
              <dt>Retry the focused reply</dt>
              <dd><Kbd>r</Kbd></dd>
            </div>
          {:else}
            <div class="shortcut-row">
              <dt>Send to the side panel (in the popup)</dt>
              <dd><Kbd>{mac ? '⌘' : 'Ctrl'}</Kbd>+<Kbd>Enter</Kbd></dd>
            </div>
            <div class="shortcut-row">
              <dt>Close tooltip</dt>
              <dd><Kbd>Esc</Kbd></dd>
            </div>
          {/if}
          <div class="shortcut-row">
            <dt>Command palette (Side panel / Settings)</dt>
            <dd><Kbd>Ctrl</Kbd>/<Kbd>⌘</Kbd>+<Kbd>K</Kbd></dd>
          </div>
          {#if isOptions}
            <div class="shortcut-row">
              <dt>Switch Settings tab (1–{lastTab})</dt>
              <dd><Kbd>Alt</Kbd>+<Kbd>1</Kbd>…<Kbd>{lastTab}</Kbd></dd>
            </div>
            <div class="shortcut-row">
              <dt>Add a rule from any Settings tab</dt>
              <dd><Kbd>{mac ? '⌘' : 'Ctrl'}</Kbd>+<Kbd>Shift</Kbd>+<Kbd>R</Kbd></dd>
            </div>
            <div class="shortcut-row">
              <dt>Search settings</dt>
              <dd><Kbd>{mac ? '⌘' : 'Ctrl'}</Kbd>+<Kbd>,</Kbd></dd>
            </div>
            <div class="shortcut-row">
              <dt>Cycle theme (system → light → dark)</dt>
              <dd><Kbd>{mac ? '⌘' : 'Ctrl'}</Kbd>+<Kbd>Shift</Kbd>+<Kbd>T</Kbd></dd>
            </div>
          {/if}
          <div class="shortcut-row">
            <dt>Show these shortcuts</dt>
            <dd><Kbd>?</Kbd></dd>
          </div>
        </dl>
        <p class="shortcut-foot" data-ega-shortcut-xref>
          Press <Kbd>{mac ? '⌘' : 'Ctrl'}</Kbd>+<Kbd>K</Kbd> for the command palette.
        </p>
        <p class="shortcut-foot">
          Change the browser shortcut at <code>chrome://extensions/shortcuts</code>.
        </p>
      </div>
    </Dialog.Content>
  </Dialog.Root>
{/if}

<style>
  .shortcut-backdrop {
    position: fixed;
    inset: 0;
    background: var(--color-backdrop);
    border: 0;
    cursor: pointer;
    padding: 0;
    z-index: 99998;
    animation: ega-shortcut-fade 120ms var(--ease-out);
  }
  :global(.shortcut-panel) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(420px, 92vw);
    box-sizing: border-box;
    max-height: calc(100vh - var(--space-8));
    overflow-y: auto;
    background: var(--color-bg);
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: 0 16px 48px var(--color-shadow-strong);
    padding: var(--space-4);
    z-index: 99999;
    animation: ega-shortcut-pop 140ms var(--ease-out);
  }
  .shortcut-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-3);
  }
  .shortcut-head h2 {
    margin: 0;
    font-size: var(--fs-lg);
    font-weight: 600;
  }
  .shortcut-close {
    background: transparent;
    border: 0;
    color: var(--color-muted);
    font-size: var(--fs-lg);
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
  }
  .shortcut-close:hover {
    background: var(--color-bg-hover);
    color: var(--color-fg);
  }
  .shortcut-list {
    margin: 0;
    display: grid;
    gap: var(--space-2);
  }
  .shortcut-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
  }
  .shortcut-row dt {
    font-size: var(--fs-sm);
    color: var(--color-fg);
  }
  .shortcut-row dd {
    margin: 0;
    display: flex;
    gap: 2px;
    align-items: center;
  }
  .shortcut-unset {
    font-size: var(--fs-xs);
    color: var(--color-muted);
    font-style: italic;
  }
  .shortcut-foot {
    margin: var(--space-3) 0 0;
    font-size: var(--fs-xs);
    color: var(--color-muted);
  }
  .shortcut-foot code {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    background: var(--color-bg-sunken);
    padding: 1px 4px;
    border-radius: var(--radius-sm);
  }
  @keyframes ega-shortcut-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes ega-shortcut-pop {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }
</style>
