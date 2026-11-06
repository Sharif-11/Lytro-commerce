import { tenantSession } from '@/session/tenant-session';

/**
 * A file the server makes, fetched as every other call is, so it names the shop the owner is on, then saved under `name`.
 * A plain link can't send that header, so the server answered for the shop the session started on (KNOWN-GAPS §113).
 */
export async function downloadFile(path: string, name: string): Promise<void> {
  const file = await tenantSession.client.file(path);
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
