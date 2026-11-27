import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TenantState,
  ChatFeatureMode,
  ChatInboxItem,
  ChatMessageView,
  ChatWaitingSummary,
} from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';

// LIVE-CHAT-PLAN (PR 1): Lytro's side of the chats. The live connection (lib/chat-connection.ts) tells of new messages;
// these read and write.

export const CHATS_QUERY_KEY = ['operator', 'chats'] as const;
// Without a live connection, the inbox and the floating button are read this often.
const POLL_MS = 20_000;

export interface ChatFeatureState {
  plan: boolean;
  mode: ChatFeatureMode;
  on: boolean;
}

export interface ChatDetail {
  shop: {
    tenantId: string;
    shopName: string;
    slug: string;
    state: TenantState;
    suspended: boolean;
    planName: string | null;
    periodEnd: string | null;
    balance: string;
  };
  feature: ChatFeatureState;
  messages: ChatMessageView[];
  lastPage: string | null;
  errors: { status: number; method: string; route: string | null; createdAt: string }[];
  people: { id: string; name: string | null; owner: boolean }[];
  historyDays: number;
}

export interface QuickReply {
  id: string;
  title: string;
  body: string;
}

export function useChatInbox(poll: boolean) {
  return useQuery({
    queryKey: [...CHATS_QUERY_KEY, 'inbox'],
    queryFn: async () =>
      (await operatorSession.client.get<{ items: ChatInboxItem[] }>('/operator/chats')).items,
    refetchInterval: poll ? POLL_MS : false,
  });
}

export function useChatWaiting(poll: boolean) {
  return useQuery({
    queryKey: [...CHATS_QUERY_KEY, 'waiting'],
    queryFn: () => operatorSession.client.get<ChatWaitingSummary>('/operator/chats/waiting'),
    refetchInterval: poll ? POLL_MS : 60_000,
  });
}

export function useChatDetail(tenantId: string, poll: boolean) {
  return useQuery({
    queryKey: [...CHATS_QUERY_KEY, 'detail', tenantId],
    queryFn: () => operatorSession.client.get<ChatDetail>(`/operator/chats/${tenantId}`),
    refetchInterval: poll ? POLL_MS : false,
  });
}

export function useChatReply(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; photos: File[] }) => {
      const photoKeys: string[] = [];
      for (const file of input.photos) {
        const started = await operatorSession.client.post<{
          key: string;
          upload: { url: string; method: 'PUT'; headers: Record<string, string> };
        }>('/operator/chat/photos', { contentType: file.type, bytes: file.size });
        const sent = await fetch(started.upload.url, {
          method: started.upload.method,
          headers: started.upload.headers,
          body: file,
        });
        if (!sent.ok) throw new Error('photo not sent');
        photoKeys.push(started.key);
      }
      return operatorSession.client.post<ChatMessageView>(`/operator/chats/${tenantId}/messages`, {
        body: input.body,
        photoKeys,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY });
    },
  });
}

export function useChatRead(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => operatorSession.client.post(`/operator/chats/${tenantId}/read`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...CHATS_QUERY_KEY, 'inbox'] });
    },
  });
}

/** LC-2: a shop's own chat setting, on its shop page. */
export function useChatFeature(tenantId: string) {
  return useQuery({
    queryKey: [...CHATS_QUERY_KEY, 'feature', tenantId],
    queryFn: () =>
      operatorSession.client.get<ChatFeatureState>(`/operator/chats/${tenantId}/feature`),
  });
}

export function useSetChatFeature(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mode: ChatFeatureMode) =>
      operatorSession.client.put<ChatFeatureState>(`/operator/chats/${tenantId}/feature`, { mode }),
    onSuccess: (state) => {
      queryClient.setQueryData([...CHATS_QUERY_KEY, 'feature', tenantId], state);
    },
  });
}

const QUICK_KEY = [...CHATS_QUERY_KEY, 'quick'] as const;

export function useQuickReplies() {
  return useQuery({
    queryKey: QUICK_KEY,
    queryFn: async () =>
      (await operatorSession.client.get<{ items: QuickReply[] }>('/operator/chat/quick-replies'))
        .items,
  });
}

export function useSaveQuickReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string | null; title: string; body: string }) =>
      input.id === null
        ? operatorSession.client.post<QuickReply>('/operator/chat/quick-replies', {
            title: input.title,
            body: input.body,
          })
        : operatorSession.client.put<QuickReply>(`/operator/chat/quick-replies/${input.id}`, {
            title: input.title,
            body: input.body,
          }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUICK_KEY });
    },
  });
}

export function useRemoveQuickReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => operatorSession.client.delete(`/operator/chat/quick-replies/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUICK_KEY });
    },
  });
}

export function useOrderQuickReplies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      operatorSession.client.put('/operator/chat/quick-replies/order', { ids }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUICK_KEY });
    },
  });
}

/** A chat photo, read through the server (the private bucket). */
export function chatPhotoUrl(id: string): string {
  return `/api/v1/operator/chat/photos/${id}`;
}
