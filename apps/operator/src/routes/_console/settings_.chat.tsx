import { createFileRoute } from '@tanstack/react-router';
import { ChatSettings } from '@/views/settings/chat-settings';

// LIVE-CHAT-PLAN (PR 1, the sketch's `oc-settings-chat`): the chat's hours, four rules and quick replies, beside Settings.
export const Route = createFileRoute('/_console/settings_/chat')({
  component: ChatSettings,
});
