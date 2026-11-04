import { createFileRoute } from '@tanstack/react-router';
import { PaymentMethodsView } from '@/views/payment-methods';

// Settings' Payment methods (§7.35): where customers pay the shop, for whoever may read them; only the owner changes them.
export const Route = createFileRoute('/$shop/settings_/payment-methods')({
  staticData: {
    screen: { hub: 'menu', section: 'settings', title: 'sMethods', back: '/$shop/settings' },
  },
  component: PaymentMethodsView,
});
