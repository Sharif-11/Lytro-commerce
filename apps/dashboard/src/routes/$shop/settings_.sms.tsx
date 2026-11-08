import { Permission } from '@lytronix/validators';
import { createFileRoute } from '@tanstack/react-router';
import { SmsView } from '@/views/sms';

type SmsTab = 'settings' | 'log' | 'report';

// Settings' SMS (§7.40, Part 37's `p37-sms`; SMS-02 to SMS-19): the ten SMS, the log and the report, for sms:read.
export const Route = createFileRoute('/$shop/settings_/sms')({
  validateSearch: (search: Record<string, unknown>): { tab?: SmsTab } =>
    search.tab === 'log' || search.tab === 'report' ? { tab: search.tab } : {},
  staticData: {
    screen: {
      hub: 'menu',
      section: 'settings',
      title: 'sSms',
      back: '/$shop/settings',
      needs: [Permission.SmsRead],
    },
  },
  component: SmsRoute,
});

function SmsRoute(): React.JSX.Element {
  const { tab } = Route.useSearch();
  return <SmsView tab={tab ?? 'settings'} />;
}
