/** `undefined` is how an invalidated extension context looks to the content script. */
export function setRuntimeId(id: string | undefined): void {
  (chrome.runtime as { id?: string | undefined }).id = id;
}
