type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

let handler: FetchHandler | undefined;

export function setFetchHandler(h: FetchHandler): void {
  handler = h;
}

export function clearFetchHandler(): void {
  handler = undefined;
}

export function installFetchMock(): void {
  globalThis.fetch = ((url: RequestInfo | URL, init?: RequestInit) => {
    if (!handler) return Promise.reject(new Error('fetch called without handler'));
    return Promise.resolve(handler(url.toString(), init));
  }) as typeof fetch;
}
