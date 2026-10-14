import type { Component } from 'svelte';
import Download from '@lucide/svelte/icons/download';
import Upload from '@lucide/svelte/icons/upload';
import Plus from '@lucide/svelte/icons/plus';
import Trash2 from '@lucide/svelte/icons/trash-2';
import RefreshCw from '@lucide/svelte/icons/refresh-cw';
import Search from '@lucide/svelte/icons/search';
import Save from '@lucide/svelte/icons/save';
import Settings from '@lucide/svelte/icons/settings';
import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
import Copy from '@lucide/svelte/icons/copy';
import Edit from '@lucide/svelte/icons/edit';
import ExternalLink from '@lucide/svelte/icons/external-link';
import ChevronDown from '@lucide/svelte/icons/chevron-down';
import X from '@lucide/svelte/icons/x';

export type ActionKind =
  | 'export'
  | 'import'
  | 'add'
  | 'delete'
  | 'refresh'
  | 'search'
  | 'save'
  | 'configure'
  | 'warn'
  | 'copy'
  | 'edit'
  | 'external-link'
  | 'expand'
  | 'close';

type LucideComponent = Component<{
  size?: number | string;
  strokeWidth?: number | string;
  class?: string;
}>;

export const ICON_REGISTRY: Record<ActionKind, LucideComponent> = {
  export: Upload,
  import: Download,
  add: Plus,
  delete: Trash2,
  refresh: RefreshCw,
  search: Search,
  save: Save,
  configure: Settings,
  warn: AlertTriangle,
  copy: Copy,
  edit: Edit,
  'external-link': ExternalLink,
  expand: ChevronDown,
  close: X,
};
