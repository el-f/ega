import type { Msg } from '@/shared/messages';

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

export async function openSidePanelWithHandoff(deps: OpenSidePanelDeps): Promise<{ ok: boolean }> {
  const { handoff, tabId, writeHandoff, openSidePanel, queryActiveTabId, logError } = deps;
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
    return { ok: !writeFailed };
  } catch (e) {
    logError(e);
    return { ok: false };
  }
}
