import { fireEvent } from '@testing-library/svelte';
import { vi } from 'vitest';

export async function tooltipMenu(root: ParentNode, name: 'More' | 'Refine'): Promise<HTMLElement> {
  const trigger = root.querySelector<HTMLElement>(`button[aria-label="${name}"]`);
  if (!trigger) throw new Error(`No ${name} trigger`);
  await fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  return vi.waitFor(() => {
    const menu = root.querySelector<HTMLElement>('[role="menu"]');
    if (!menu) throw new Error('No open menu');
    return menu;
  });
}

export async function toggleTooltipAbout(root: ParentNode): Promise<void> {
  const menu = await tooltipMenu(root, 'More');
  const about = menu.querySelector<HTMLElement>('[role="menuitemcheckbox"]');
  if (!about) throw new Error('No About this reply item');
  await fireEvent.click(about);
}
