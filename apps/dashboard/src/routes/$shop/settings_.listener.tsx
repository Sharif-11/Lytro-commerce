import { createFileRoute } from '@tanstack/react-router';
import { ListenerPhonesView } from '@/views/listener';

// Settings' Listener phones (§7.37): the phones that read a shop's payment SMS, for whoever may read them.
export const Route = createFileRoute('/$shop/settings_/listener')({
  staticData: {
    screen: { hub: 'menu', section: 'settings', title: 'sListener', back: '/$shop/settings' },
  },
  component: ListenerPhonesView,
});
