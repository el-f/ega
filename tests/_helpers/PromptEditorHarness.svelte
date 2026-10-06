<script lang="ts">
  /** Holds the draft the way a dialog does, so PromptEditor runs controlled. */
  import type { ComponentProps } from 'svelte';
  import PromptEditor from '@/options/components/prompt/PromptEditor.svelte';
  import type { PromptTemplate } from '@/shared/types';

  type Props = Omit<ComponentProps<typeof PromptEditor>, 'template' | 'onChange'> & {
    initial: PromptTemplate;
    onChange?: (next: PromptTemplate) => void;
  };

  const { initial, onChange, ...rest }: Props = $props();
  // svelte-ignore state_referenced_locally
  let template = $state(initial);
</script>

<PromptEditor
  {...rest}
  {template}
  onChange={(next) => {
    template = next;
    onChange?.(next);
  }}
/>
