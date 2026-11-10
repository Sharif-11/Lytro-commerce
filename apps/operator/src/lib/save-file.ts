/** Offers a file the server sent to save, such as a report's CSV, under the name given. */
export function saveFile(filename: string, file: Blob): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
