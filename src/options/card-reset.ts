import { saveSettings } from '@/options/storage-with-toast';
import { toastStore } from '@/shared/components/toastStore';
import type { Settings } from '@/shared/types';

type CardDefaults = Partial<Omit<Settings, 'advanced'>> & {
  advanced?: Partial<Settings['advanced']>;
};

/** The stored values the reset will overwrite, in the same shape, so Undo writes them straight back. */
function valuesBefore(defaults: CardDefaults, cur: Settings): CardDefaults {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(defaults)) {
    if (key === 'advanced' && defaults.advanced) {
      out['advanced'] = Object.fromEntries(
        Object.keys(defaults.advanced).map((k) => [
          k,
          cur.advanced[k as keyof Settings['advanced']],
        ]),
      );
    } else out[key] = cur[key as keyof Settings];
  }
  return out as CardDefaults;
}

/** A card's "Reset section": acts at once, then a toast "<Card> is back to defaults" with Undo. */
export async function resetCardWithUndo(
  title: string,
  defaults: CardDefaults,
  cur: Settings,
  onSaved: (next: Settings) => void,
): Promise<void> {
  const before = valuesBefore(defaults, cur);
  const next = await saveSettings(defaults as Partial<Settings>);
  if (!next) return;
  onSaved(next);
  toastStore.push({
    message: `${title} is back to defaults`,
    variant: 'success',
    action: {
      label: 'Undo',
      onClick: () =>
        void saveSettings(before as Partial<Settings>).then((restored) => {
          if (restored) onSaved(restored);
        }),
    },
  });
}
