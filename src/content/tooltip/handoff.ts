// The SW writes the handoff slot: session storage is kept to trusted contexts, so a content script cannot read or write it.
import type { Tone } from '@/shared/task-prompts';
import type { TaskId } from '@/shared/task-view';
import { sendMsg } from '@/shared/messages';
import { IMAGE_TURN_PLACEHOLDER } from '@/shared/constants';
import { currentSettings } from '@/content/settings-cache';
import { canHandOffImage } from '@/shared/image-url-guard';
import type { ErrCode } from '@/shared/types';
import { closeStickyToast, showToast } from '../toast';

export type EscalationKind = 'continue' | 'pin' | 'open-image' | 'open-panel';

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
  /** Open-panel mode — the code the image failed with. */
  errorCode?: ErrCode;
}

const IMAGE_LEFT_BEHIND = 'Attach the image in the side panel. Ega cannot pass this one along.';

/** The SW writes the handoff slot before it opens the panel, so a mount during the open call still sees it. True only when the worker says the panel opened with it. */
export async function escalateToSidepanel(args: EscalateArgs): Promise<boolean> {
  // A new action: an older notice is out of date. A toast this path shows comes after.
  closeStickyToast();
  // A failed image goes into the panel's composer, ready to send again; it does not run on its own.
  if (args.subKind === 'open-panel') {
    const image = args.imageDataUrl;
    // IMAGE_UNSUPPORTED is the image itself (format, size, an address Ega cannot fetch), so a re-send from the panel fails the same way.
    const attach =
      image !== undefined && args.errorCode !== 'IMAGE_UNSUPPORTED' && canHandOffImage(image)
        ? image
        : undefined;
    try {
      const reply = await sendMsg(
        attach !== undefined
          ? {
              kind: 'ui:open-sidepanel',
              handoff: {
                sourceText: '',
                sourceLang: args.sourceLang,
                targetLang: args.targetLang,
                task: 'translate',
                tone: args.tone ?? currentSettings()?.defaultTone ?? 'neutral',
                imageDataUrl: attach,
                attachImage: true,
              },
            }
          : { kind: 'ui:open-sidepanel' },
      );
      if (reply?.ok !== true) return false;
      // The worker re-checks the image and may leave it behind too; either way the panel opens empty.
      if (image !== undefined && (attach === undefined || reply.imageLeftBehind === true)) {
        showToast(IMAGE_LEFT_BEHIND);
      }
      return true;
    } catch {
      return false;
    }
  }
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
