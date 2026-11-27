import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CHAT_PHOTO_MAX_BYTES,
  CHAT_PHOTO_TYPES,
  CHAT_POLL_SECONDS,
  type ChatMessageView,
  type ChatView,
} from '@lytronix/validators';
import { sendWithProgress } from '@/lib/media-upload';
import { tenantSession } from '@/session/tenant-session';

// LIVE-CHAT-PLAN (PR 1): the shop's one chat with Lytro. The live connection (lib/chat-connection.ts) tells of new
// messages; these routes read and write. Without a connection, the chat is read every CHAT_POLL_SECONDS while open.

export const CHAT_QUERY_KEY = ['chat'] as const;

/** GET /chat: on or not, the hours, and the kept days' messages. `poll` while the live connection is down. */
export function useChat(options: { enabled?: boolean; poll?: boolean } = {}) {
  return useQuery({
    queryKey: CHAT_QUERY_KEY,
    queryFn: () => tenantSession.client.get<ChatView>('/chat'),
    enabled: options.enabled ?? true,
    refetchInterval: options.poll ? CHAT_POLL_SECONDS * 1000 : false,
    staleTime: 30_000,
  });
}

/** The chat as it stands, with one more message in it (from the live connection or a send). */
export function withMessage(
  chat: ChatView | undefined,
  message: ChatMessageView,
): ChatView | undefined {
  if (!chat || chat.messages.some((each) => each.id === message.id)) return chat;
  return { ...chat, messages: [...chat.messages, message] };
}

/** A photo too big or of a kind the chat doesn't take (LC-8). */
export function chatPhotoRefused(file: File): boolean {
  return (
    !(CHAT_PHOTO_TYPES as readonly string[]).includes(file.type) || file.size > CHAT_PHOTO_MAX_BYTES
  );
}

/** LC-8: one photo to the signed link; its key goes with the message. */
async function uploadChatPhoto(file: File): Promise<string> {
  const started = await tenantSession.client.post<{
    key: string;
    upload: { url: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string };
  }>('/chat/photos', { contentType: file.type, bytes: file.size });
  const sent = await sendWithProgress(started.upload, file, () => undefined);
  if (!sent) throw new Error('photo not sent');
  return started.key;
}

/** POST /chat/messages: words, up to three photos, or both, with the page the person was on. */
export function useSendChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; photos: File[]; page: string }) => {
      const photoKeys: string[] = [];
      for (const file of input.photos) photoKeys.push(await uploadChatPhoto(file));
      return tenantSession.client.post<ChatMessageView>('/chat/messages', {
        body: input.body,
        photoKeys,
        page: input.page,
      });
    },
    onSuccess: (message) => {
      queryClient.setQueryData<ChatView>(CHAT_QUERY_KEY, (chat) => withMessage(chat, message));
    },
  });
}

/** POST /chat/read: the person read the chat to now. */
export function useReadChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tenantSession.client.post<{ unread: number }>('/chat/read', {}),
    onSuccess: () => {
      queryClient.setQueryData<ChatView>(CHAT_QUERY_KEY, (chat) =>
        chat ? { ...chat, unread: 0 } : chat,
      );
    },
  });
}

/** Where a chat photo is read from: the server itself, the shop's own (never a storage link). */
export function chatPhotoUrl(id: string): string {
  return `/api/v1/chat/photos/${id}`;
}
