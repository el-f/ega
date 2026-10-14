import type { Msg, MsgReply } from '@/shared/messages';
import { canHandOffImage } from '@/shared/image-url-guard';

type OpenSidePanelMsg = Extract<Msg, { kind: 'ui:open-sidepanel' }>;
export type OpenSidePanelHandoff = NonNullable<OpenSidePanelMsg['handoff']>;

export interface OpenSidePanelDeps {
  handoff?: OpenSidePanelHandoff;
  tabId: number | undefined;
  writeHandoff: (h: OpenSidePanelHandoff) => Promise<void>;
  openSidePanel: (opts: { tabId: number }) => Promise<void>;
  queryActiveTabId: () => Promise<number | undefined>;
  logError: (e: unknown) => void;
}

export async function openSidePanelWithHandoff(
  deps: OpenSidePanelDeps,
): Promise<MsgReply['ui:open-sidepanel']> {
  const { tabId, writeHandoff, openSidePanel, queryActiveTabId, logError } = deps;
  // A content script sends this image and the panel puts it straight into an <img src>, so an unsafe
  // one is not written. Nor is one the panel's reader would drop for size: writing it would only fill storage.
  const imageLeftBehind =
    deps.handoff?.attachImage === true && !canHandOffImage(deps.handoff.imageDataUrl ?? '');
  const handoff = imageLeftBehind ? undefined : deps.handoff;
  try {
    // open() must fire inside the user-gesture window, so the handoff write starts here but is awaited after it.
    let writeFailed = false;
    // Caught at the source: an open() that throws would otherwise leave this rejection unhandled.
    const writeP = handoff
      ? writeHandoff(handoff).catch((e: unknown) => {
          logError(e);
          writeFailed = true;
        })
      : undefined;
    if (tabId !== undefined) {
      await openSidePanel({ tabId });
    } else {
      const activeTabId = await queryActiveTabId();
      if (activeTabId !== undefined) await openSidePanel({ tabId: activeTabId });
    }
    if (writeP) await writeP;
    // The panel still opens; the flag lets the page say the image did not come along.
    return imageLeftBehind ? { ok: !writeFailed, imageLeftBehind: true } : { ok: !writeFailed };
  } catch (e) {
    logError(e);
    return { ok: false };
  }
}
