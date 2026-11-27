import { createFileRoute } from '@tanstack/react-router';
import { ChatsPage } from '@/views/chats';

// LIVE-CHAT-PLAN (PR 1, the sketch's `oc-inbox`): the chats with shops.
export const Route = createFileRoute('/_console/inbox/')({
  component: ChatsPage,
});
