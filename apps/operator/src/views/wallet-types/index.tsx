import { useTranslation } from 'react-i18next';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';

/** OPERATOR-CONSOLE-DESIGN v7 (Slice 8.8): built to the sketch with its page; the route and the sidebar's entry come first. */
export function WalletTypes(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <ConsolePage>
      <PageTitle title={t('nav.walletTypes')} />
    </ConsolePage>
  );
}
