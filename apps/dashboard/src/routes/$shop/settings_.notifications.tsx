import { createFileRoute } from '@tanstack/react-router';
import { NotificationPrefsView } from '@/views/notifications/prefs';

// Settings' Notifications (§7.40, Part 37's `p37-prefs`; NTF-02, NTF-04): each person's own switches and push on this device,
// so no section rule: whoever is signed in may open their own.
export const Route = createFileRoute('/$shop/settings_/notifications')({
  staticData: {
    screen: { hub: 'menu', title: 'sNotif', back: '/$shop/settings' },
  },
  component: NotificationPrefsView,
});
