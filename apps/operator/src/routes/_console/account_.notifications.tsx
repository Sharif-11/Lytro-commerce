import { createFileRoute } from '@tanstack/react-router';
import { MyNotifications } from '@/views/account/notifications';

// LIVE-CHAT-PLAN LC-4 (PR 1, the sketch's `oc-notif`): this operator's chat notifications on this browser.
export const Route = createFileRoute('/_console/account_/notifications')({
  component: MyNotifications,
});
