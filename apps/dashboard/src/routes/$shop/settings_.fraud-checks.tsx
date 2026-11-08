import { Permission } from '@lytronix/validators';
import { createFileRoute } from '@tanstack/react-router';
import { FraudRuleView } from '@/views/fraud/rule';

// Settings' fake order check (§7.40, Part 37's `p37-fraud-rule`; FRD-05, D7-50): the automatic check, for fraud:read.
export const Route = createFileRoute('/$shop/settings_/fraud-checks')({
  staticData: {
    screen: {
      hub: 'menu',
      section: 'settings',
      title: 'sFraud',
      back: '/$shop/settings',
      needs: [Permission.FraudRead],
    },
  },
  component: FraudRuleView,
});
