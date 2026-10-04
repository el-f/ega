export function downloadJsonFile(filename: string, data: unknown): void {
  downloadTextFile(filename, JSON.stringify(data, null, 2), 'application/json');
}

export function downloadTextFile(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Deferred so the download dialog can resolve the URL first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
