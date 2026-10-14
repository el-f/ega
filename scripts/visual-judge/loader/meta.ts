// No sidecar falls back to a filename guess; a wrong guess only picks the `unknown.md` rules.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ShotMeta } from '../judge/types';

export function inferSurface(name: string): string {
  if (name.startsWith('popup')) return 'popup';
  if (name.startsWith('sidepanel')) return 'sidepanel';
  if (name.startsWith('tooltip')) return 'tooltip';
  if (name.startsWith('smart-bubble')) return 'smart-bubble';
  if (name.startsWith('picker')) return 'picker';
  if (
    name.startsWith('options') ||
    name.startsWith('subtab') ||
    name.startsWith('settings-search') ||
    name.startsWith('00-advanced')
  )
    return 'options';
  if (
    name.startsWith('templates') ||
    name.startsWith('rules-editor') ||
    name.startsWith('profiles') ||
    name.startsWith('per-preset') ||
    name.startsWith('per-site') ||
    name.startsWith('slot-palette')
  )
    return 'templates';
  if (name.startsWith('page-translate') || name.startsWith('inline-replace'))
    return 'page-translate';
  if (name.startsWith('image-translate')) return 'image-ocr';
  return 'unknown';
}

export async function loadMeta(metaDir: string, name: string): Promise<ShotMeta> {
  const metaPath = path.join(metaDir, `${name}.meta.json`);
  try {
    const raw = await readFile(metaPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ShotMeta>;
    const out: ShotMeta = {
      name,
      surface: parsed.surface ?? inferSurface(name),
      state: parsed.state ?? 'default',
    };
    if (parsed.theme) out.theme = parsed.theme;
    if (parsed.userAction) out.userAction = parsed.userAction;
    if (parsed.expectations) out.expectations = parsed.expectations;
    if (parsed.viewport) out.viewport = parsed.viewport;
    return out;
  } catch {
    return { name, surface: inferSurface(name), state: 'default' };
  }
}
