import { createFileRoute } from '@tanstack/react-router';
import { Account } from '@/views/account';

// The first build's screen, framed by the new shell until its own pull request of Slice 11 rebuilds it.
export const Route = createFileRoute('/$shop/account')({
  staticData: { screen: { hub: 'menu', section: 'account', title: 'secAccount', legacy: true } },
  component: Account,
});
