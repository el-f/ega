<script lang="ts">
  /** The one line under a control. Its words are the setting's search description, so the two never drift. */
  import { settingHint } from '@/shared/settings-registry';

  interface Props {
    /** The SETTINGS_SPEC id whose description is the hint. */
    setting: string;
    /** For aria-describedby on the control. */
    id?: string;
    /** Indents the line under a checkbox's label. */
    indent?: boolean;
  }

  const { setting, id, indent = false }: Props = $props();
</script>

<p class="setting-hint" class:indent {id} data-ega-hint={setting}>{settingHint(setting)}</p>

<style>
  .setting-hint {
    margin: 0;
    max-inline-size: 80ch;
    font-size: var(--fs-base);
    line-height: var(--lh-body);
    color: var(--color-muted);
  }
  .indent {
    padding-inline-start: calc(16px + var(--space-2));
  }
</style>
