// The SW writes the handoff slot: session storage is kept to trusted contexts, so a content script cannot read or write it.
import type { Tone } from '@/shared/task-prompts';
import type { TaskId } from '@/shared/task-view';
import { sendMsg } from '@/shared/messages';
import { IMAGE_TURN_PLACEHOLDER } from '@/shared/constants';
import { currentSettings } from '@/content/settings-cache';

export type EscalationKind = 'continue' | 'pin' | 'open-image';

export interface EscalateArgs {
  subKind: EscalationKind;
  text: string;
  sourceLang: string;
  targetLang: string;
  task?: TaskId;
  tone?: Tone;
  /** Explain-mode body; seeds the first assistant turn. */
  response?: string;
  /** Image-OCR mode — the source image's data URL. */
  imageDataUrl?: string;
  /** Image-OCR mode — the OCR'd text from the image. */
  ocrText?: string;
  /** Pin mode — an explanation that rides along with the re-dispatch instead of replacing it. */
  explain?: string;
}

/** The SW writes the handoff slot before it opens the panel, so a mount during the open call still sees it. True only when the worker says the panel opened with it. */
export async function escalateToSidepanel(args: EscalateArgs): Promise<boolean> {
  // Image-OCR tooltips have no page selection, so the OCR text becomes the source.
  const sourceText =
    args.subKind === 'open-image' && args.text.trim().length === 0
      ? // ocrText carries the vision ANSWER, so it belongs on the assistant turn, never on the user turn.
        args.imageDataUrl !== undefined
        ? IMAGE_TURN_PLACEHOLDER
        : (args.ocrText ?? args.text)
      : args.text;
  try {
    const reply = await sendMsg({
      kind: 'ui:open-sidepanel',
      handoff: {
        sourceText,
        sourceLang: args.sourceLang,
        targetLang: args.targetLang,
        task: args.task ?? 'translate',
        tone: args.tone ?? currentSettings()?.defaultTone ?? 'neutral',
        ...(args.response ? { response: args.response } : {}),
        ...(args.imageDataUrl ? { imageDataUrl: args.imageDataUrl } : {}),
        ...(args.ocrText ? { ocrText: args.ocrText } : {}),
        ...(args.explain ? { explain: args.explain } : {}),
      },
    });
    return reply?.ok === true;
  } catch {
    return false;
  }
}
