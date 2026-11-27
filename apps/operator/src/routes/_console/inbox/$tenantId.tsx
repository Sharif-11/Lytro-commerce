import { createFileRoute } from '@tanstack/react-router';
import { ChatPage } from '@/views/chats';

// LIVE-CHAT-PLAN (PR 1, the sketch's `oc-chat`): one shop's chat, with the shop beside it.
export const Route = createFileRoute('/_console/inbox/$tenantId')({
  component: function ChatRoute() {
    const { tenantId } = Route.useParams();
    return <ChatPage tenantId={tenantId} />;
  },
});
