/** Every (family, surface, action) needs a .flow.spec.ts carrying a `coverage: family.surface.action` block comment, or pnpm coverage:flows fails. */
export interface Action {
  readonly id: string;
  readonly description: string;
  readonly flows: readonly string[];
}
export interface Surface {
  readonly id: string;
  readonly actions: readonly Action[];
}
export interface Family {
  readonly id: string;
  readonly surfaces: readonly Surface[];
}

export const COVERAGE: readonly Family[] = [
  {
    id: 'translation',
    surfaces: [
      {
        id: 'tooltip',
        actions: [
          {
            id: 'close-button-follows-click-outside',
            description: 'Click-outside dismiss on hides the ✕ close button; off shows it',
            flows: ['tooltip/close-button-follows-click-outside.flow.spec.ts'],
          },
          {
            id: 'copy-button',
            description: 'Click copy -> clipboard receives translation',
            flows: ['tooltip/copy-button.flow.spec.ts'],
          },
          {
            id: 'explain-label',
            description: 'Header flips to "Explaining..." while explain runs',
            flows: ['tooltip/explain-label.flow.spec.ts'],
          },
          {
            id: 'task-switch',
            description: 'Header task picker switches task and re-runs',
            flows: ['tooltip/task-switch.flow.spec.ts'],
          },
          {
            id: 'tone-switch',
            description: 'Header tone picker switches tone and re-runs',
            flows: ['tooltip/tone-switch.flow.spec.ts'],
          },
          {
            id: 'direction-swap',
            description: 'Swap button reverses source<->target and re-runs',
            flows: ['tooltip/direction-swap.flow.spec.ts'],
          },
          {
            id: 'drag-to-move',
            description: 'Drag handle moves the tooltip to a new screen pos',
            flows: ['tooltip/drag-to-move.flow.spec.ts'],
          },
          {
            id: 'close-x',
            description: 'Close (X) button dismisses the tooltip',
            flows: ['tooltip/close-x.flow.spec.ts'],
          },
          {
            id: 'cancel-loading',
            description: 'Cancel during loading aborts the in-flight translate',
            flows: ['tooltip/cancel-loading.flow.spec.ts'],
          },
          {
            id: 'retry-on-error',
            description: 'Retry button re-runs after an error',
            flows: ['tooltip/retry-on-error.flow.spec.ts'],
          },
          {
            id: 'click-outside-dismiss',
            description: 'Click outside dismisses (when setting enabled)',
            flows: ['tooltip/click-outside-dismiss.flow.spec.ts'],
          },
          {
            id: 'keyboard-esc',
            description: 'Esc dismisses the tooltip',
            flows: ['tooltip/keyboard-esc.flow.spec.ts'],
          },
          {
            id: 'scroll-tracks',
            description: 'Tooltip stays anchored when the page scrolls',
            flows: ['tooltip/scroll-tracks.flow.spec.ts'],
          },
          {
            id: 'theme-respects',
            description: 'Tooltip honors light/dark/system theme',
            flows: ['tooltip/theme-respects.flow.spec.ts'],
          },
          {
            id: 'confidence-pill-shown',
            description: 'Pill renders when confidence>=threshold',
            flows: ['tooltip/confidence-pill-shown.flow.spec.ts'],
          },
          {
            id: 'confidence-pill-hidden',
            description: 'Pill hidden when confidence<threshold',
            flows: ['tooltip/confidence-pill-hidden.flow.spec.ts'],
          },
          {
            id: 'multi-variety-cluster',
            description: 'Multi-variety detection renders pill cluster',
            flows: ['tooltip/multi-variety-cluster.flow.spec.ts'],
          },
          {
            id: 'detected-language-pill',
            description: 'One detected language renders one pill: preset label + detail',
            flows: ['tooltip/detected-language-pill.flow.spec.ts'],
          },
          {
            id: 'inspector-drawer',
            description: 'Inspector drawer opens with ResultMeta',
            flows: ['tooltip/inspector-drawer.flow.spec.ts'],
          },
          {
            id: 'context-preview',
            description: 'ContextPreview footer renders when contextSent set',
            flows: ['tooltip/context-preview.flow.spec.ts'],
          },
          {
            id: 'inline-replace',
            description: 'Inline-replace mode swaps text in-place',
            flows: ['tooltip/inline-replace.flow.spec.ts'],
          },
          {
            id: 'image-inline',
            description: 'Image-translate result renders image above body',
            flows: ['tooltip/image-inline.flow.spec.ts'],
          },
          {
            id: 'open-options-link',
            description: 'Error-card "Open settings" CTA opens options shell',
            flows: ['tooltip/open-options-link.flow.spec.ts'],
          },
          {
            id: 'diff-on-retranslate',
            description: 'Re-translate renders word-level diff vs prior body',
            flows: ['tooltip/diff-on-retranslate.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'site-disable',
        actions: [
          {
            id: 'hotkey-translate-blocked',
            description: 'Translate hotkey on a disabled site toasts and opens no tooltip',
            flows: ['site-disable/hotkey-translate-blocked.flow.spec.ts'],
          },
          {
            id: 'page-translate-blocked',
            description:
              'page:translateAll on a disabled site toasts and never enters multi-select',
            flows: ['site-disable/page-translate-blocked.flow.spec.ts'],
          },
          {
            id: 'no-session-selection-write',
            description: 'Selection on a disabled site leaves nothing for the popup to prefill',
            flows: ['site-disable/no-session-selection-write.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'smart-bubble',
        actions: [
          {
            id: 'selection-shows-bubble',
            description: 'Eligible selection mounts the smart bubble',
            flows: ['smart-bubble/selection-shows-bubble.flow.spec.ts'],
          },
          {
            id: 'digitless-arabizi-shows',
            description: 'Digitless arabizi triggers the bubble heuristic',
            flows: ['smart-bubble/digitless-arabizi-shows.flow.spec.ts'],
          },
          {
            id: 'short-arabizi-shows',
            description:
              'Short arabizi still mounts the bubble; the English check does not claim it',
            flows: ['smart-bubble/short-arabizi-shows.flow.spec.ts'],
          },
          {
            id: 'click-opens-tooltip',
            description: 'Click on bubble opens the translation tooltip',
            flows: ['smart-bubble/click-opens-tooltip.flow.spec.ts'],
          },
          {
            id: 'per-site-disabled',
            description: 'Site disabled -> bubble does not mount',
            flows: ['smart-bubble/per-site-disabled.flow.spec.ts'],
          },
          {
            id: 'bubble-latency',
            description: 'Bubble first-paint latency under budget',
            flows: ['smart-bubble/bubble-latency.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'popup',
        actions: [
          {
            id: 'keyboard-tab-order',
            description:
              'Tab walks the popup top to bottom with a ring; Esc closes the backend popover',
            flows: ['popup/keyboard-tab-order.flow.spec.ts'],
          },
          {
            id: 'prefill-from-selection',
            description: 'Opening popup auto-expands freeform with active selection',
            flows: ['popup/prefill-from-selection.flow.spec.ts'],
          },
          {
            id: 'freeform-send-handoff',
            description: 'Send-to-panel writes pendingPopupHandoff + opens sidepanel',
            flows: ['popup/freeform-send-handoff.flow.spec.ts'],
          },
          {
            id: 'translate-clipboard',
            description: 'Clipboard tile hands off to sidepanel via handoff slot',
            flows: ['popup/translate-clipboard.flow.spec.ts'],
          },
          {
            id: 'source-lang-pick',
            description: 'Source language persists into the handoff slot payload',
            flows: ['popup/source-lang-pick.flow.spec.ts'],
          },
          {
            id: 'target-lang-pick',
            description: 'Target language persists into the handoff slot payload',
            flows: ['popup/target-lang-pick.flow.spec.ts'],
          },
          {
            id: 'open-side-panel',
            description: 'Panel tile launches sidepanel',
            flows: ['popup/open-side-panel.flow.spec.ts'],
          },
          {
            id: 'open-picker',
            description: 'Pick tile enters picker mode on active tab',
            flows: ['popup/open-picker.flow.spec.ts'],
          },
          {
            id: 'translate-page',
            description: 'Page tile runs full-page translate on active tab',
            flows: ['popup/translate-page.flow.spec.ts'],
          },
          {
            id: 'open-settings',
            description: 'Header gear opens the options page in a tab',
            flows: ['popup/open-settings.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'sidepanel',
        actions: [
          {
            id: 'custom-image-task',
            description: 'An image sent with an image-taking custom task carries the custom prompt',
            flows: ['sidepanel/custom-image-task.flow.spec.ts'],
          },
          {
            id: 'backend-pill',
            description: 'Backend pill renders active backend name',
            flows: ['sidepanel/backend-pill.flow.spec.ts'],
          },
          {
            id: 'settings-cog',
            description: 'Settings cog opens the options shell',
            flows: ['sidepanel/settings-cog.flow.spec.ts'],
          },
          {
            id: 'bookmark-filter',
            description:
              'More menu turns the bookmark filter on; Show all in the filter bar turns it off',
            flows: ['sidepanel/bookmark-filter.flow.spec.ts'],
          },
          {
            id: 'drop-text',
            description: 'Drop plain text onto the composer appends to value',
            flows: ['sidepanel/drop-text.flow.spec.ts'],
          },
          {
            id: 'input-send',
            description: 'Sending input appends a user turn + assistant turn',
            flows: ['sidepanel/input-send.flow.spec.ts'],
          },
          {
            id: 'stream-tokens',
            description: 'Assistant turn streams tokens visibly',
            flows: ['sidepanel/stream-tokens.flow.spec.ts'],
          },
          {
            id: 'multi-variety-cluster',
            description: 'Multi-variety detection renders a pill cluster on the assistant turn',
            flows: ['sidepanel/multi-variety-cluster.flow.spec.ts'],
          },
          {
            id: 'multi-turn',
            description: 'Second turn retains prior context',
            flows: ['sidepanel/multi-turn.flow.spec.ts'],
          },
          {
            id: 'panel-scrolls-not-page',
            description: 'A long conversation scrolls the stream, not the panel',
            flows: ['sidepanel/panel-scrolls-not-page.flow.spec.ts'],
          },
          {
            id: 'quick-refine-chip',
            description: 'Quick-refine chip amends the last assistant turn',
            flows: ['sidepanel/quick-refine-chip.flow.spec.ts'],
          },
          {
            id: 'task-switch-convo',
            description: 'Task switch within conversation re-routes prompts',
            flows: ['sidepanel/task-switch-convo.flow.spec.ts'],
          },
          {
            id: 'tone-switch-convo',
            description: 'Tone switch within conversation re-routes prompts',
            flows: ['sidepanel/tone-switch-convo.flow.spec.ts'],
          },
          {
            id: 'target-lang-retranslate',
            description: 'Target picker re-answers the last turn as a variant in the new language',
            flows: ['sidepanel/target-lang-retranslate.flow.spec.ts'],
          },
          {
            id: 'empty-answer',
            description: 'A reply that comes back empty says so instead of rendering a blank turn',
            flows: ['sidepanel/empty-answer.flow.spec.ts'],
          },
          {
            id: 'save-failed-banner',
            description:
              'A conversation that cannot be saved says so; Try again clears it once the write lands',
            flows: ['sidepanel/save-failed-banner.flow.spec.ts'],
          },
          {
            id: 'error-state',
            description: 'Error chunk renders inline + offers retry',
            flows: ['sidepanel/error-state.flow.spec.ts'],
          },
          {
            id: 'retry-after-error',
            description: 'Retry button re-runs the failed turn',
            flows: ['sidepanel/retry-after-error.flow.spec.ts'],
          },
          {
            id: 'refine-inline-freeform',
            description:
              'Freeform [+ Refine] input submits custom text → variant with custom refinement on wire',
            flows: ['sidepanel/refine-inline-freeform.flow.spec.ts'],
          },
          {
            id: 'refine-busy-rejected',
            description:
              'Refine chip click while translate in-flight → toast "Wait — translation in progress", no second variant',
            flows: ['sidepanel/refine-busy-rejected.flow.spec.ts'],
          },
          {
            id: 'edit-last-keyboard',
            description:
              'Press e key → last user turn pulled into composer; re-send → exactly 2 user turns',
            flows: ['sidepanel/edit-last-keyboard.flow.spec.ts'],
          },
          {
            id: 'composer-options',
            description:
              'Message options popover → pick Rich + turn off live reply → both saved; Esc returns focus',
            flows: ['sidepanel/composer-options.flow.spec.ts'],
          },
          {
            id: 'cancel-all-inflight',
            description:
              'Cancel-all button appears while streaming → click → button gone + turn exits streaming',
            flows: ['sidepanel/cancel-all-inflight.flow.spec.ts'],
          },
          {
            id: 'variant-nav-prev-next',
            description:
              'After refine spawns variant 2/2 → click prev → reads 1/2 and body reverts',
            flows: ['sidepanel/variant-nav-prev-next.flow.spec.ts'],
          },
          {
            id: 'refine-on-explain-turn',
            description:
              'Explain turn done → chips mount → [Shorter] → variant with explain=true on wire',
            flows: ['sidepanel/refine-on-explain-turn.flow.spec.ts'],
          },
          {
            id: 'image-turn-no-refine-chips',
            description:
              'External image-translate turn completes → thumbnail + Regenerate present, refine chips absent',
            flows: ['sidepanel/image-turn-no-refine-chips.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'conversation',
        actions: [
          {
            id: 'assistant-turn-render',
            description: 'AssistantTurn renders streamed content + meta',
            flows: ['conversation/assistant-turn-render.flow.spec.ts'],
          },
          {
            id: 'user-turn-render',
            description: 'UserTurn renders source text + task/tone',
            flows: ['conversation/user-turn-render.flow.spec.ts'],
          },
          {
            id: 'copy-assistant-turn',
            description: 'Copy button on assistant turn fills clipboard',
            flows: ['conversation/copy-assistant-turn.flow.spec.ts'],
          },
          {
            id: 'hover-no-layout-shift',
            description: 'Hover/focus reveal of a turn action row moves no turn geometry',
            flows: ['conversation/hover-no-layout-shift.flow.spec.ts'],
          },
          {
            id: 'per-origin-persistence',
            description:
              'Conversation persists across panel reload; new-conversation clears storage',
            flows: ['conversation/per-origin-persistence.flow.spec.ts'],
          },
        ],
      },
    ],
  },
  {
    id: 'vision',
    surfaces: [
      {
        id: 'picker',
        actions: [
          {
            id: 'enter-via-message',
            description: 'picker:enter message mounts the overlay on the page',
            flows: ['picker/enter-via-message.flow.spec.ts'],
          },
          {
            id: 'hover-outlines-target',
            description: 'Hovering an element paints the outline at its rect',
            flows: ['picker/hover-outlines-target.flow.spec.ts'],
          },
          {
            id: 'click-selects-translates',
            description: 'Clicking an element exits picker + opens the tooltip',
            flows: ['picker/click-selects-translates.flow.spec.ts'],
          },
          {
            id: 'escape-cancels',
            description: 'Esc dismisses the overlay without firing a translate',
            flows: ['picker/escape-cancels.flow.spec.ts'],
          },
          {
            id: 'sensitive-target-rejected',
            description: 'Click on password/input is discarded, mode stays on',
            flows: ['picker/sensitive-target-rejected.flow.spec.ts'],
          },
          {
            id: 'empty-element-toast',
            description: 'Clicking an empty element exits + shows a toast',
            flows: ['picker/empty-element-toast.flow.spec.ts'],
          },
          {
            id: 'disabled-no-op',
            description: 'pickerEnabled=false makes picker:enter a no-op',
            flows: ['picker/disabled-no-op.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'image-ocr',
        actions: [
          {
            id: 'tooltip-result-renders',
            description: 'image-translate-result mounts tooltip + source image',
            flows: ['image-ocr/tooltip-result-renders.flow.spec.ts'],
          },
          {
            id: 'tooltip-error-renders',
            description: 'image-translate error chunk surfaces the error label',
            flows: ['image-ocr/tooltip-error-renders.flow.spec.ts'],
          },
          {
            id: 'sidepanel-seed-then-stream',
            description: 'sidepanel seed advisory + chunk renders assistant',
            flows: ['image-ocr/sidepanel-seed-then-stream.flow.spec.ts'],
          },
          {
            id: 'image-aspect-preserved',
            description: 'Source image keeps natural aspect (no height squash)',
            flows: ['image-ocr/image-aspect-preserved.flow.spec.ts'],
          },
          {
            id: 'explain-action-hidden',
            description: 'Explain button hidden when imageUrl set on tooltip',
            flows: ['image-ocr/explain-action-hidden.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'page-translate',
        actions: [
          {
            id: 'bilingual-default',
            description: 'v2 default inserts a bilingual sibling per non-English block',
            flows: ['page-translate/bilingual-default.flow.spec.ts'],
          },
          {
            id: 'reload-toast-after-chunk-loss',
            description:
              'A page-translate that cannot load its code offers Reload page, and the button reloads',
            flows: ['page-translate/reload-toast-after-chunk-loss.flow.spec.ts'],
          },
          {
            id: 'inplace-mode-opt-in',
            description: 'v2 inplace mode replaces each block in place',
            flows: ['page-translate/inplace-mode-opt-in.flow.spec.ts'],
          },
          {
            id: 'revert-all',
            description: 'Cancel reverts every inserted sibling + restores DOM',
            flows: ['page-translate/revert-all.flow.spec.ts'],
          },
          {
            id: 'abort-on-nav',
            description: 'pagehide tears down the v2 batch + reverts blocks',
            flows: ['page-translate/abort-on-nav.flow.spec.ts'],
          },
          {
            id: 'inline-replace-mode',
            description: 'Inline replace mode swaps text in-place on selection',
            flows: ['page-translate/inline-replace-mode.flow.spec.ts'],
          },
          {
            id: 'replaced-block-styled',
            description: 'A page-DOM replaced block gets styling from the page-level sheet',
            flows: ['page-translate/replaced-block-styled.flow.spec.ts'],
          },
          {
            id: 'multi-select-toolbar',
            description:
              'Translate-areas toolbar picks blocks, refuses the document, and re-opens over a settled pill',
            flows: ['page-translate/multi-select-toolbar.flow.spec.ts'],
          },
          {
            id: 'multi-select-keyboard',
            description: 'Arrows/Space/Enter pick and translate areas with no mouse',
            flows: ['page-translate/multi-select-keyboard.flow.spec.ts'],
          },
        ],
      },
    ],
  },
  {
    id: 'templating',
    surfaces: [
      {
        id: 'rules-editor',
        actions: [
          {
            id: 'manual-add-rule',
            description: 'Manual form creates a rule and persists to storage',
            flows: ['rules-editor/manual-add-rule.flow.spec.ts'],
          },
          {
            id: 'edit-rule-body',
            description: 'Click-to-edit rule saves the trimmed text',
            flows: ['rules-editor/edit-rule-body.flow.spec.ts'],
          },
          {
            id: 'toggle-enabled',
            description: 'Power toggle flips the enabled flag in storage',
            flows: ['rules-editor/toggle-enabled.flow.spec.ts'],
          },
          {
            id: 'delete-rule-confirms',
            description: 'Delete confirms, removes rule, surfaces Undo toast',
            flows: ['rules-editor/delete-rule-confirms.flow.spec.ts'],
          },
          {
            id: 'advanced-disclosure-open',
            description: 'Advanced rules summary shows the row editor; the add form stays outside',
            flows: ['rules-editor/advanced-disclosure-open.flow.spec.ts'],
          },
          {
            id: 'undo-delete',
            description:
              'Seed two rules → delete one → Undo toast → click Undo → rule re-inserted at original index',
            flows: ['rules-editor/undo-delete.flow.spec.ts'],
          },
          {
            id: 'toggle-task-scope',
            description:
              'Seed rule with scope.tasks=[translate] → click chip → tasks=[]; click again → translate re-added',
            flows: ['rules-editor/toggle-task-scope.flow.spec.ts'],
          },
          {
            id: 'edit-category-in-advanced',
            description:
              'Seed rule category=always → Advanced → category select → never → storage reflects updated category',
            flows: ['rules-editor/edit-category-in-advanced.flow.spec.ts'],
          },
          {
            id: 'remove-site-scope',
            description:
              'Seed rule scope.sites=[example.com] → Advanced → click site chip → scope.sites removed',
            flows: ['rules-editor/remove-site-scope.flow.spec.ts'],
          },
          {
            id: 'rules-budget-warning',
            description:
              'Seed >8 KB of rules → open Rules chip → budget-warn banner visible with KB count',
            flows: ['rules-editor/rules-budget-warning.flow.spec.ts'],
          },
        ],
      },
    ],
  },
  {
    id: 'options',
    surfaces: [
      {
        id: 'shell',
        actions: [
          {
            id: 'left-rail-renders',
            description: 'Left rail lists every tab under group headings',
            flows: ['options-shell/left-rail-renders.flow.spec.ts'],
          },
          {
            id: 'tab-switch',
            description: 'Clicking a tab swaps the active panel + aria state',
            flows: ['options-shell/tab-switch.flow.spec.ts'],
          },
          {
            id: 'keyboard-tab-nav',
            description: 'Arrow + Home/End + Alt-digit walk the tablist',
            flows: ['options-shell/keyboard-tab-nav.flow.spec.ts'],
          },
          {
            id: 'deep-link-settings-search',
            description:
              'Ctrl+, → select result → Advanced opens at correct sub-tab + target card flashes',
            flows: ['options-shell/deep-link-settings-search.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'advanced',
        actions: [
          {
            id: 'subtab-navigation',
            description:
              'Advanced sub-tab clicks navigate Data/Labs panes; sessionStorage persists active tab',
            flows: ['options-advanced/subtab-navigation.flow.spec.ts'],
          },
          {
            id: 'diagnostics-tools-reset',
            description:
              'Change debug log level → SectionReset appears → click → reverts to default',
            flows: ['options-advanced/diagnostics-tools-reset.flow.spec.ts'],
          },
          {
            id: 'labs-probe-ttl-slider',
            description: 'Labs → probe TTL slider ArrowRight → advanced.backendProbeTtlMs persists',
            flows: ['options-advanced/labs-probe-ttl-slider.flow.spec.ts'],
          },
          {
            id: 'saved-conversations',
            description:
              'Data lists saved side panel threads; Delete empties an open panel, Clear all removes every thread',
            flows: ['options-advanced/saved-conversations.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'tasks',
        actions: [
          {
            id: 'export',
            description:
              'Export tasks downloads egaTasks v2 with rows, edits, on/off and the Translate prompt',
            flows: ['options-tasks/export.flow.spec.ts'],
          },
          {
            id: 'import-replace',
            description: 'Import tasks replaces rows, edits and on/off and reports what it skipped',
            flows: ['options-tasks/import-replace.flow.spec.ts'],
          },
          {
            id: 'add-custom-task-appears-in-pickers',
            description: 'New task saves a row that shows in the chip strip and the tooltip select',
            flows: ['options-tasks/add-custom-task-appears-in-pickers.flow.spec.ts'],
          },
          {
            id: 'custom-task-prompt-used-by-request',
            description:
              'A custom task sends its own prompt plus the plain contract; the answer renders',
            flows: ['options-tasks/custom-task-prompt-used-by-request.flow.spec.ts'],
          },
          {
            id: 'delete-custom-task-keeps-turns',
            description: 'Deleting a custom task keeps past answers, labelled "Deleted task"',
            flows: ['options-tasks/delete-custom-task-keeps-turns.flow.spec.ts'],
          },
          {
            id: 'list-renders',
            description:
              'Tasks tab lists 7 built-ins with Edited/Off badges; Translate toggle disabled',
            flows: ['options-tasks/list-renders.flow.spec.ts'],
          },
          {
            id: 'toggle-hides-everywhere',
            description:
              'Turning a task off hides it in the chip strip, palette, Re-run and tooltip select',
            flows: ['options-tasks/toggle-hides-everywhere.flow.spec.ts'],
          },
          {
            id: 'switches-persist',
            description: 'Task dialog effort, page context and glossary persist across a reload',
            flows: ['options-tasks/switches-persist.flow.spec.ts'],
          },
          {
            id: 'reset-builtin-undo',
            description: 'Reset to built-in drops the task edit; the toast Undo restores it',
            flows: ['options-tasks/reset-builtin-undo.flow.spec.ts'],
          },
          {
            id: 'page-context-off-drops-context',
            description: 'Translate with page context off sends no page text to the backend',
            flows: ['options-tasks/page-context-off-drops-context.flow.spec.ts'],
          },
          {
            id: 'default-task-change',
            description: 'Default task and default tone persist from the Tasks tab',
            flows: ['options-tasks/default-task-change.flow.spec.ts'],
          },
          {
            id: 'compiled-preview',
            description: 'The prompt preview renders the resolved instructions + message',
            flows: ['options-tasks/compiled-preview.flow.spec.ts'],
          },
          {
            id: 'save-blocked-by-validation',
            description: 'Removing {{text}} shows alert and leaves storage unchanged',
            flows: ['options-tasks/save-blocked-by-validation.flow.spec.ts'],
          },
          {
            id: 'version-banner-keep-mine',
            description:
              'Banner Keep mine sets templateVersionAcknowledged; promptTemplate unchanged',
            flows: ['options-tasks/version-banner-keep-mine.flow.spec.ts'],
          },
          {
            id: 'version-banner-overwrite',
            description: 'Banner Overwrite replaces promptTemplate with default after confirm',
            flows: ['options-tasks/version-banner-overwrite.flow.spec.ts'],
          },
          {
            id: 'version-banner-show-diff',
            description: 'Banner Show diff mounts TemplateDiffModal',
            flows: ['options-tasks/version-banner-show-diff.flow.spec.ts'],
          },
          {
            id: 'kept-snippets-warning',
            description:
              'A row whose snippets cannot be written out keeps them and warns in the editor',
            flows: ['options-tasks/kept-snippets-warning.flow.spec.ts'],
          },
          {
            id: 'insert-at-cursor-into-sys',
            description:
              'Focus system textarea, click slot chip → token inserts in system field via lastFocused routing',
            flows: ['options-tasks/insert-at-cursor-into-sys.flow.spec.ts'],
          },
          {
            id: 'insert-variable-popover',
            description: 'Insert variable popover surfaces searchable slots',
            flows: ['options-tasks/insert-variable-popover.flow.spec.ts'],
          },
          {
            id: 'palette-renders',
            description: 'Slot palette lists per-task slots with chips',
            flows: ['options-tasks/palette-renders.flow.spec.ts'],
          },
          {
            id: 'required-missing-blocks-save',
            description:
              'Remove {{text}} from user template → required-missing badge appears AND Save is blocked',
            flows: ['options-tasks/required-missing-blocks-save.flow.spec.ts'],
          },
          {
            id: 'required-missing-flag',
            description: 'Required slot deleted from user template flags chip',
            flows: ['options-tasks/required-missing-flag.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'translate',
        actions: [
          {
            id: 'lang-defaults-swap',
            description: 'Swap button swaps source/target defaults + shows toast',
            flows: ['options-translate/lang-defaults-swap.flow.spec.ts'],
          },
          {
            id: 'glossary-scope-auto-detect',
            description:
              'Glossary scope help explains the Auto-detect rule the picker offers, and the rule holds',
            flows: ['options-translate/glossary-scope-auto-detect.flow.spec.ts'],
          },
          {
            id: 'generation-temperature-slider',
            description: 'Adjust global temperature slider → persists; ResetField → reverts',
            flows: ['options-translate/generation-temperature-slider.flow.spec.ts'],
          },
          {
            id: 'cache-disable',
            description: 'Uncheck cacheEnabled persists false; re-check persists true',
            flows: ['options-translate/cache-disable.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'context-menu',
        actions: [
          {
            id: 'manage',
            description:
              'Add image action, drag-reorder, live preview, target-lang + reset persist to contextMenuItems/Layout',
            flows: ['options-context-menu/manage.flow.spec.ts'],
          },
          {
            id: 'custom-task-item',
            description: 'A text item can be set to a custom task; contextMenuItems stores its id',
            flows: ['options-context-menu/custom-task-item.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'languages',
        actions: [
          {
            id: 'variety-add',
            description: 'Add custom language form seeds customLanguages entry',
            flows: ['options-languages/variety-add.flow.spec.ts'],
          },
          {
            id: 'variety-delete',
            description: 'Delete custom language removes the entry',
            flows: ['options-languages/variety-delete.flow.spec.ts'],
          },
          {
            id: 'variety-export',
            description: 'Export languages button triggers JSON download',
            flows: ['options-languages/variety-export.flow.spec.ts'],
          },
          {
            id: 'variety-import',
            description: 'Import languages JSON replaces customLanguages + shows imported counts',
            flows: ['options-languages/variety-import.flow.spec.ts'],
          },
          {
            id: 'variety-import-cancel',
            description: 'Import languages → cancel confirm → customLanguages unchanged',
            flows: ['options-languages/variety-import-cancel.flow.spec.ts'],
          },
          {
            id: 'variety-toggle-enabled',
            description: 'Enable checkbox toggle persists disabledVarieties; re-check removes id',
            flows: ['options-languages/variety-toggle-enabled.flow.spec.ts'],
          },
          {
            id: 'variety-edit-save',
            description: 'Edit variety hint and Save persists hint + shows Saved ✓',
            flows: ['options-languages/variety-edit-save.flow.spec.ts'],
          },
          {
            id: 'variety-reset-to-built-in',
            description: 'Reset to built-in deletes the override; the toast Undo puts it back',
            flows: ['options-languages/variety-reset-to-built-in.flow.spec.ts'],
          },
          {
            id: 'variety-add-example',
            description: 'Add another example in editor persists src+tgt pair',
            flows: ['options-languages/variety-add-example.flow.spec.ts'],
          },
          {
            id: 'variety-filter',
            description: 'Filter languages input narrows list; clear restores full list',
            flows: ['options-languages/variety-filter.flow.spec.ts'],
          },
          {
            id: 'prompt-save',
            description: 'Save in a language prompt stores perPresetTemplates for that language',
            flows: ['options-languages/prompt-save.flow.spec.ts'],
          },
          {
            id: 'prompt-clear',
            description: 'Clear removes the language prompt; the toast Undo puts it back',
            flows: ['options-languages/prompt-clear.flow.spec.ts'],
          },
          {
            id: 'prompt-inherits-global',
            description: 'A language without its own prompt starts from the Translate prompt',
            flows: ['options-languages/prompt-inherits-global.flow.spec.ts'],
          },
          {
            id: 'prompt-own-label',
            description: 'A row says whether the language has its own prompt',
            flows: ['options-languages/prompt-own-label.flow.spec.ts'],
          },
          {
            id: 'prompt-custom-language',
            description: 'A custom language can have its own prompt',
            flows: ['options-languages/prompt-custom-language.flow.spec.ts'],
          },
          {
            id: 'prompt-open-editor',
            description: 'Write a prompt opens the prompt editor inside the language row',
            flows: ['options-languages/prompt-open-editor.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'backends',
        actions: [
          {
            id: 'api-key-edit',
            description: 'Anthropic API key persists anthropicApiKey',
            flows: ['options-backends/api-key-edit.flow.spec.ts'],
          },
          {
            id: 'enable-disable',
            description: 'Toggle disables a backend via disabledBackends',
            flows: ['options-backends/enable-disable.flow.spec.ts'],
          },
          {
            id: 'model-select',
            description: 'Model field persists settings.model.anthropic',
            flows: ['options-backends/model-select.flow.spec.ts'],
          },
          {
            id: 'prewarm-native-toggle',
            description:
              'Pre-warm native CLI toggle persists settings.preWarmNative both directions',
            flows: ['options-backends/prewarm-native-toggle.flow.spec.ts'],
          },
          {
            id: 'install-info-tooltip',
            description: '(i) icon on native card opens tooltip with install/uninstall summary',
            flows: ['options-backends/install-info-tooltip.flow.spec.ts'],
          },
          {
            id: 'backup-export-all',
            description: 'Advanced→Data → Export all settings → download triggered + status shown',
            flows: ['options-backends/backup-export-all.flow.spec.ts'],
          },
          {
            id: 'backup-export-with-keys-confirm',
            description:
              'Advanced→Data → include keys → Export all settings → type EXPORT KEYS → download fires',
            flows: ['options-backends/backup-export-with-keys-confirm.flow.spec.ts'],
          },
          {
            id: 'backup-import-all-settings',
            description:
              'Advanced→Data → Import → pick valid JSON → confirm → settings overwritten → status shown',
            flows: ['options-backends/backup-import-all-settings.flow.spec.ts'],
          },
          {
            id: 'backup-import-cancel',
            description: 'Advanced→Data → Import → pick file → cancel confirm → settings unchanged',
            flows: ['options-backends/backup-import-cancel.flow.spec.ts'],
          },
          {
            id: 'reset-all-advanced-to-defaults',
            description: 'Advanced→Data → Reset ALL → type RESET → defaults restored toast',
            flows: ['options-backends/reset-all-advanced-to-defaults.flow.spec.ts'],
          },
          {
            id: 'test-button-fires',
            description:
              'Expand cloud backend with key → Test now → latency badge + result text renders',
            flows: ['options-backends/test-button-fires.flow.spec.ts'],
          },
          {
            id: 'api-key-show-hide',
            description:
              'Expand cloud provider → Eye → key reveals (type=text) → EyeOff → masked (type=password)',
            flows: ['options-backends/api-key-show-hide.flow.spec.ts'],
          },
          {
            id: 'api-key-edited-at-timestamp',
            description:
              'Expand cloud provider → paste new API key → "Edited just now" line appears + apiKeyEditedAt written to storage',
            flows: ['options-backends/api-key-edited-at-timestamp.flow.spec.ts'],
          },
          {
            id: 'model-reset-to-default',
            description:
              'Change cloud provider model → click ResetField arrow → model reverts to provider default',
            flows: ['options-backends/model-reset-to-default.flow.spec.ts'],
          },
          {
            id: 'model-discover-refresh',
            description:
              'Expand cloud provider with key → Refresh model list → discovered models populate → pick one → persists',
            flows: ['options-backends/model-discover-refresh.flow.spec.ts'],
          },
          {
            id: 'ollama-url-edit',
            description:
              'Expand Ollama card → change URL → Discover models → error or model list renders',
            flows: ['options-backends/ollama-url-edit.flow.spec.ts'],
          },
          {
            id: 'reorder-keyboard',
            description: 'Focus backend gutter + Alt+ArrowDown → backendOrder swaps in storage',
            flows: ['options-backends/reorder-keyboard.flow.spec.ts'],
          },
          {
            id: 'local-timeout-slider',
            description:
              'Backends tab → local-backend timeout slider → ArrowRight → localBackendTimeoutMs persists',
            flows: ['options-backends/local-timeout-slider.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'about',
        actions: [
          {
            id: 'version-display',
            description: 'About tab renders Privacy + Credits + source link',
            flows: ['options-about/version-display.flow.spec.ts'],
          },
          {
            id: 'clear-cache',
            description: 'About → Clear cache → confirm → session cache key removed',
            flows: ['options-about/clear-cache.flow.spec.ts'],
          },
          {
            id: 'delete-all-data',
            description: 'About → Delete all data → type DELETE → storage cleared',
            flows: ['options-about/delete-all-data.flow.spec.ts'],
          },
          {
            id: 'delete-all-data-cancel',
            description:
              'About → Delete all data → wrong confirm text → disabled → storage untouched',
            flows: ['options-about/delete-all-data-cancel.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'command-palette',
        actions: [
          {
            id: 'keyboard-run',
            description:
              'Ctrl+K opens the palette with focus in the query; arrows move, Home stays in the field, Enter runs',
            flows: ['options-command-palette/keyboard-run.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'settings-search',
        actions: [
          {
            id: 'open-shortcut',
            description: 'Ctrl+, opens the settings-search modal',
            flows: ['options-settings-search/open-shortcut.flow.spec.ts'],
          },
          {
            id: 'fuzzy-search',
            description: 'Typing narrows the result list to matching entries',
            flows: ['options-settings-search/fuzzy-search.flow.spec.ts'],
          },
          {
            id: 'jump-to-result',
            description: 'Enter on a result jumps to the target tab',
            flows: ['options-settings-search/jump-to-result.flow.spec.ts'],
          },
          {
            id: 'close-esc',
            description: 'Esc dismisses the settings-search modal',
            flows: ['options-settings-search/close-esc.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'onboarding',
        actions: [
          {
            id: 'banner-renders-on-first-run',
            description: 'Welcome banner renders without keys or dismissed flag',
            flows: ['options-onboarding/banner-renders-on-first-run.flow.spec.ts'],
          },
          {
            id: 'banner-dismissable',
            description: 'Skip dismisses the banner + sets onboardingDismissed',
            flows: ['options-onboarding/banner-dismissable.flow.spec.ts'],
          },
          {
            id: 'choose-gemini-jumps-to-backends',
            description: 'Add-Gemini CTA jumps to the Backends tab',
            flows: ['options-onboarding/choose-gemini-jumps-to-backends.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'site-overrides-review',
        actions: [
          {
            id: 'clear-host',
            description: 'Per-row clear removes the host entry from sitePrefs',
            flows: ['options-site-overrides-review/clear-host.flow.spec.ts'],
          },
          {
            id: 'clear-all',
            description: 'Clear-all empties sitePrefs after confirm',
            flows: ['options-site-overrides-review/clear-all.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'audit-log',
        actions: [
          {
            id: 'entry-renders',
            description: 'Seeded audit-log entry renders under Diagnostics',
            flows: ['options-audit-log/entry-renders.flow.spec.ts'],
          },
          {
            id: 'export-log',
            description: 'Export-as-JSON triggers a download',
            flows: ['options-audit-log/export-log.flow.spec.ts'],
          },
          {
            id: 'filter-by-task',
            description: 'Task filter narrows list and surfaces match count',
            flows: ['options-audit-log/filter-by-task.flow.spec.ts'],
          },
          {
            id: 'clear-log',
            description: 'Clear button + confirm removes all entries from storage and empties list',
            flows: ['options-audit-log/clear-log.flow.spec.ts'],
          },
          {
            id: 'expand-entry',
            description: 'Clicking entry row opens collapsible body with prompt/response/latency',
            flows: ['options-audit-log/expand-entry.flow.spec.ts'],
          },
          {
            id: 'filter-by-backend',
            description: 'Backend filter dropdown narrows list to matching backend',
            flows: ['options-audit-log/filter-by-backend.flow.spec.ts'],
          },
          {
            id: 'filter-by-status',
            description:
              'Status filter shows only error entries; switch to cache shows only cache entries',
            flows: ['options-audit-log/filter-by-status.flow.spec.ts'],
          },
          {
            id: 'diff-two-entries',
            description: 'Compare on two entries opens AuditDiffModal with side-by-side diff',
            flows: ['options-audit-log/diff-two-entries.flow.spec.ts'],
          },
          {
            id: 'quick-filter-from-entry',
            description:
              'Expand entry then click task quick-filter chip applies filter + scrolls filter row into view',
            flows: ['options-audit-log/quick-filter-from-entry.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'glossary',
        actions: [
          {
            id: 'add-entry',
            description: 'Add Glossary entry persists into settings.glossary',
            flows: ['options-glossary/add-entry.flow.spec.ts'],
          },
          {
            id: 'delete-entry',
            description: 'Add entry then click trash icon → entry removed from settings.glossary',
            flows: ['options-glossary/delete-entry.flow.spec.ts'],
          },
          {
            id: 'add-entry-with-lang-scope',
            description:
              'Fill term+translation+pick source/target lang+enable case-sensitive → entry stored with all fields',
            flows: ['options-glossary/add-entry-with-lang-scope.flow.spec.ts'],
          },
          {
            id: 'add-entry-cap-error',
            description:
              'Seed 200 glossary entries → attempt to add → error "Glossary limit is 200 entries — delete one before adding another" shows, no entry written',
            flows: ['options-glossary/add-entry-cap-error.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'display',
        actions: [
          {
            id: 'mode-toggle',
            description:
              'DisplaySurfaceSection toggle swaps defaultDisplayMode and reveals mode-specific knobs',
            flows: ['options-display/mode-toggle.flow.spec.ts'],
          },
          {
            id: 'image-translate-surface-select',
            description:
              'Translate tab, Display section → change "Image translation opens in" select → imageTranslateSurface persists',
            flows: ['options-display/image-translate-surface-select.flow.spec.ts'],
          },
          {
            id: 'tooltip-knobs-toggle',
            description:
              'Translate tab, Display section (tooltip mode) → toggle Show-original / Click-outside / Drag-to-move → each persists',
            flows: ['options-display/tooltip-knobs-toggle.flow.spec.ts'],
          },
          {
            id: 'confidence-pill-toggle',
            description:
              'Translate tab, Display section → toggle Confidence pill → when enabled slider appears; when disabled it collapses',
            flows: ['options-display/confidence-pill-toggle.flow.spec.ts'],
          },
          {
            id: 'section-reset',
            description:
              'Translate tab, Display section → modify a tooltip knob → SectionReset appears → click → knobs revert to DEFAULT_SETTINGS',
            flows: ['options-display/section-reset.flow.spec.ts'],
          },
        ],
      },
    ],
  },
  {
    id: 'integration',
    surfaces: [
      {
        id: 'popup-sidepanel-handoff',
        actions: [
          {
            id: 'clipboard-tile-handoff-payload',
            description:
              'Popup clipboard tile writes pendingPopupHandoff; sidepanel reads + clears slot',
            flows: [
              'integration/popup-sidepanel-handoff/clipboard-tile-handoff-payload.flow.spec.ts',
            ],
          },
          {
            id: 'freeform-cold-start-restore',
            description:
              'Popup freeform Send-to-panel: cold-start sidepanel seeds from handoff slot',
            flows: ['integration/popup-sidepanel-handoff/freeform-cold-start-restore.flow.spec.ts'],
          },
          {
            id: 'freeform-warm-handoff',
            description:
              'Popup freeform with sidepanel already open: warm-handoff via chrome.runtime',
            flows: ['integration/popup-sidepanel-handoff/freeform-warm-handoff.flow.spec.ts'],
          },
          {
            id: 'handoff-slot-cleared-after-read',
            description:
              'Sidepanel reads handoff slot once, then storage.remove; second open re-uses nothing',
            flows: [
              'integration/popup-sidepanel-handoff/handoff-slot-cleared-after-read.flow.spec.ts',
            ],
          },
          {
            id: 'handoff-slot-survives-popup-close',
            description: 'Popup closes before sidepanel opens: slot persists; cold-start reads it',
            flows: [
              'integration/popup-sidepanel-handoff/handoff-slot-survives-popup-close.flow.spec.ts',
            ],
          },
          {
            id: 'handoff-stale-payload-rejected',
            description: 'Handoff slot older than 60s on read: ignored; sidepanel mounts clean',
            flows: [
              'integration/popup-sidepanel-handoff/handoff-stale-payload-rejected.flow.spec.ts',
            ],
          },
          {
            id: 'popup-overlay-clamps-360',
            description: 'Popup body data-ega-popup attribute clamps overlay to 360px column',
            flows: ['integration/popup-sidepanel-handoff/popup-overlay-clamps-360.flow.spec.ts'],
          },
          {
            id: 'lang-pair-flows-through-handoff',
            description: 'Popup lang pair piped through handoff payload into first sidepanel turn',
            flows: [
              'integration/popup-sidepanel-handoff/lang-pair-flows-through-handoff.flow.spec.ts',
            ],
          },
          {
            id: 'picker-tile-tab-state',
            description: 'Popup pick tile enters picker mode on active tab; window closes',
            flows: ['integration/popup-sidepanel-handoff/picker-tile-tab-state.flow.spec.ts'],
          },
          {
            id: 'page-tile-page-translate-kickoff',
            description: 'Popup page tile kicks off page-translate; sidepanel notification appears',
            flows: [
              'integration/popup-sidepanel-handoff/page-tile-page-translate-kickoff.flow.spec.ts',
            ],
          },
          {
            id: 'handoff-then-refine',
            description:
              'Popup freeform handoff seeds sidepanel; quick-refine chip on the seeded turn spawns a refined variant',
            flows: ['integration/popup-sidepanel-handoff/handoff-then-refine.flow.spec.ts'],
          },
          {
            id: 'handoff-then-multi-turn',
            description:
              'Handoff seeds turn 1; user sends turn 2; both turns render in order, second dispatch fires',
            flows: ['integration/popup-sidepanel-handoff/handoff-then-multi-turn.flow.spec.ts'],
          },
          {
            id: 'two-handoffs-sequential',
            description:
              'Two popup handoffs before sidepanel opens; both seeded turns render in insertion order',
            flows: ['integration/popup-sidepanel-handoff/two-handoffs-sequential.flow.spec.ts'],
          },
          {
            id: 'handoff-then-task-switch',
            description:
              'Handoff with task=translate seeds; user switches task to reword; next send carries reword template',
            flows: ['integration/popup-sidepanel-handoff/handoff-then-task-switch.flow.spec.ts'],
          },
          {
            id: 'handoff-then-retry',
            description:
              'Seeded turn enters error state; Retry button re-dispatches the same content',
            flows: ['integration/popup-sidepanel-handoff/handoff-then-retry.flow.spec.ts'],
          },
          {
            id: 'warm-handoff-then-refine',
            description:
              'Sidepanel open first; popup handoff arrives via storage.onChanged; refine chip works on delivered turn',
            flows: ['integration/popup-sidepanel-handoff/warm-handoff-then-refine.flow.spec.ts'],
          },
        ],
      },
      {
        id: 'tooltip-sidepanel-escalation',
        actions: [
          {
            id: 'retry-escalates-to-sidepanel',
            description:
              'Tooltip retry exhaustion offers Continue-in-sidepanel; opens with context',
            flows: [
              'integration/tooltip-sidepanel-escalation/retry-escalates-to-sidepanel.flow.spec.ts',
            ],
          },
          {
            id: 'audit-entry-fans-out',
            description:
              'Audit entry from tooltip visible in popup chip count + options panel + sidepanel',
            flows: ['integration/tooltip-sidepanel-escalation/audit-entry-fans-out.flow.spec.ts'],
          },
          {
            id: 'cache-hit-cross-surface',
            description:
              'Same text translated via tooltip then sidepanel: second hit is cache, no network',
            flows: [
              'integration/tooltip-sidepanel-escalation/cache-hit-cross-surface.flow.spec.ts',
            ],
          },
          {
            id: 'tooltip-explain-then-sidepanel-pin',
            description:
              'Explain in tooltip then Pin-to-sidepanel seeds conversation with request+response',
            flows: [
              'integration/tooltip-sidepanel-escalation/tooltip-explain-then-sidepanel-pin.flow.spec.ts',
            ],
          },
          {
            id: 'tooltip-error-toast-bus',
            description:
              'Tooltip error logs audit error; sidepanel Toaster mounts toast within 500ms',
            flows: [
              'integration/tooltip-sidepanel-escalation/tooltip-error-toast-bus.flow.spec.ts',
            ],
          },
          {
            id: 'image-ocr-tooltip-then-sidepanel',
            description:
              'Image OCR tooltip "Open in side panel" hands image + text into conversation',
            flows: [
              'integration/tooltip-sidepanel-escalation/image-ocr-tooltip-then-sidepanel.flow.spec.ts',
            ],
          },
          {
            id: 'sidepanel-shares-tooltip-cancellation',
            description:
              'Sidepanel Cancel-all aborts in-flight tooltip translate via shared CancelReason',
            flows: [
              'integration/tooltip-sidepanel-escalation/sidepanel-shares-tooltip-cancellation.flow.spec.ts',
            ],
          },
          {
            id: 'audit-clear-syncs-across-surfaces',
            description:
              'Options Clear audit log zeroes popup chip + sidepanel inline trace within 1s',
            flows: [
              'integration/tooltip-sidepanel-escalation/audit-clear-syncs-across-surfaces.flow.spec.ts',
            ],
          },
          {
            id: 'tooltip-escalation-preserves-lang',
            description:
              'Tooltip detected source lang carried into sidepanel handoff and first turn',
            flows: [
              'integration/tooltip-sidepanel-escalation/tooltip-escalation-preserves-lang.flow.spec.ts',
            ],
          },
          {
            id: 'tooltip-retry-budget-shared',
            description:
              'Sidepanel retryBudget slider affects next tooltip attempt budget; live mutation',
            flows: [
              'integration/tooltip-sidepanel-escalation/tooltip-retry-budget-shared.flow.spec.ts',
            ],
          },
          {
            id: 'escalation-then-refine',
            description:
              'Tooltip explain → Pin seeds sidepanel; quick-refine [Shorter] on seeded turn spawns variant',
            flows: ['integration/tooltip-sidepanel-escalation/escalation-then-refine.flow.spec.ts'],
          },
          {
            id: 'image-ocr-escalation-refine-blocked',
            description:
              'Image OCR tooltip → sidepanel seeds image turn; refine chips are absent (non-refinable)',
            flows: [
              'integration/tooltip-sidepanel-escalation/image-ocr-escalation-refine-blocked.flow.spec.ts',
            ],
          },
          {
            id: 'escalation-then-retry',
            description:
              'Tooltip explain → Pin seeds text turn; Retry re-dispatches via attachedToTurnId linkage',
            flows: ['integration/tooltip-sidepanel-escalation/escalation-then-retry.flow.spec.ts'],
          },
          {
            id: 'escalation-then-copy',
            description:
              'Tooltip explain → Pin seeds turn; copy button writes pinned body to clipboard',
            flows: ['integration/tooltip-sidepanel-escalation/escalation-then-copy.flow.spec.ts'],
          },
          {
            id: 'escalate-continue-seeds-sidepanel',
            description:
              'Continue-in-sidepanel opens sidepanel with source text as a fresh user turn via conversation.send',
            flows: [
              'integration/tooltip-sidepanel-escalation/escalate-continue-seeds-sidepanel.flow.spec.ts',
            ],
          },
        ],
      },
      {
        id: 'settings-runtime-propagation',
        actions: [
          {
            id: 'backend-chain-edit-mid-stream',
            description: 'Reorder backendOrder mid-stream; next attempt honors new chain',
            flows: [
              'integration/settings-runtime-propagation/backend-chain-edit-mid-stream.flow.spec.ts',
            ],
          },
          {
            id: 'cache-disable-flushes-mid-stream',
            description:
              'cacheEnabled flipped false during in-flight; next sidepanel turn bypasses cache',
            flows: [
              'integration/settings-runtime-propagation/cache-disable-flushes-mid-stream.flow.spec.ts',
            ],
          },
          {
            id: 'rules-edit-propagates-to-sidepanel',
            description:
              'Rules edited in options; sidepanel next turn sends system prompt with new block',
            flows: [
              'integration/settings-runtime-propagation/rules-edit-propagates-to-sidepanel.flow.spec.ts',
            ],
          },
          {
            id: 'task-override-used-by-request',
            description:
              'An edited built-in prompt (taskOverrides) is the system text the next side-panel request sends',
            flows: [
              'integration/settings-runtime-propagation/task-override-used-by-request.flow.spec.ts',
            ],
          },
          {
            id: 'display-mode-change-live',
            description:
              'Display mode toggled in options; mounted tooltip re-renders without close+reopen',
            flows: [
              'integration/settings-runtime-propagation/display-mode-change-live.flow.spec.ts',
            ],
          },
          {
            id: 'theme-change-cross-surface',
            description:
              'Theme written to storage; sidepanel + options flip data-theme in one frame',
            flows: [
              'integration/settings-runtime-propagation/theme-change-cross-surface.flow.spec.ts',
            ],
          },
          {
            id: 'quota-exceeded-write-fails-loudly',
            description:
              'A settings write that storage rejects for quota acks ok:false, reason quota',
            flows: [
              'integration/settings-runtime-propagation/quota-exceeded-write-fails-loudly.flow.spec.ts',
            ],
          },
          {
            id: 'per-site-override-write-survives-reload',
            description:
              'Per-site override set; tab reload; override still applied (sitePrefStored regression)',
            flows: [
              'integration/settings-runtime-propagation/per-site-override-write-survives-reload.flow.spec.ts',
            ],
          },
          {
            id: 'settings-change-during-handoff-drain',
            description:
              'Backend patched between handoff write and cold-mount drain; first seeded turn uses patched backend',
            flows: [
              'integration/settings-runtime-propagation/settings-change-during-handoff-drain.flow.spec.ts',
            ],
          },
        ],
      },
    ],
  },
];
