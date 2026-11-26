import type { ChatPhotoFile } from './services/live-chat';

/** The parts of an Express response a chat photo is written with. */
export interface ChatPhotoResponse {
  status(code: number): ChatPhotoResponse;
  set(headers: Record<string, string>): ChatPhotoResponse;
  send(body: Buffer): unknown;
}

/**
 * LC-8: a chat photo answered by the server itself, never through a link (the private bucket). A person sent it, so it
 * is never sniffed into something else and runs nothing if opened on its own; the browser may keep it for a day, as it
 * never changes under its ID.
 */
export function sendChatPhoto(response: ChatPhotoResponse, file: ChatPhotoFile): void {
  response
    .status(200)
    .set({
      'Content-Type': file.contentType,
      'Cache-Control': 'private, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
    })
    .send(file.body);
}
