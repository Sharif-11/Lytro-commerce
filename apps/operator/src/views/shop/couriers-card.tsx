import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { useCourierKeyUses } from '@/api/couriers';
import { ConsoleCard } from '@/components/ui/console-page';
import { CardList, LIST_ROW, RowLines } from '@/components/ui/list-row';
import { SMALL_BUTTON } from '@/components/ui/sizes';
import { formatSessionTime } from '@/lib/session-time';

/** OPERATOR-CONSOLE-DESIGN §5 (v4): the shop's courier key log, with its last use (SEC-11). */
export function CouriersCard({ shopId }: { shopId: string }): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lastUse = useCourierKeyUses(shopId, 1, 1);
  const last = lastUse.data?.uses[0];
  return (
    <ConsoleCard>
      <h2 className="mb-1 text-[16px] font-semibold">{t('courierKeys.card')}</h2>
      <CardList>
        <div className={LIST_ROW}>
          <RowLines
            wrap
            title={t('courierKeys.title')}
            detail={`${t('courierKeys.hint')}${
              last ? ` ${t('shop.credentialsLast', { d: formatSessionTime(last.at) })}` : ''
            }`}
          />
          <Button
            type="button"
            tone="outline"
            small
            fit
            className={SMALL_BUTTON}
            onClick={() => {
              void navigate({ to: '/shops/$id/courier-keys', params: { id: shopId } });
            }}
          >
            {t('shop.credentialsOpen')}
          </Button>
        </div>
      </CardList>
    </ConsoleCard>
  );
}
