import { useTranslation } from 'react-i18next';
import type { IconName } from '@/components/icon';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';

/**
 * A section whose screen the first build never had, until its own pull request of Slice 11 builds it (agreed for
 * Slice 11.3): the hub's navigation reaches it and says so, instead of a dead link.
 */
export function Arriving({ icon }: { icon: IconName }): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { screen } = useShell();
  return (
    <ShellPage>
      <Card>
        <EmptyState icon={icon}>
          <b>{t('arrivingT', { s: screen?.title ? t(screen.title) : '' })}</b>
          <br />
          {t('arrivingL')}
        </EmptyState>
      </Card>
    </ShellPage>
  );
}
