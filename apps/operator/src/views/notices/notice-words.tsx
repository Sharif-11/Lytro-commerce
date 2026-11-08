import { useTranslation } from 'react-i18next';
import {
  NoticeAudienceKind,
  NoticeSeverity,
  NoticeStatus,
  type NoticeAudience,
} from '@lytronix/validators';
import { usePlans } from '@/api/plans';
import { useShop } from '@/api/shops';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';

const SEVERITY_TONES: Record<NoticeSeverity, ChipTone> = {
  [NoticeSeverity.Info]: 'info',
  [NoticeSeverity.Important]: 'warn',
  [NoticeSeverity.Urgent]: 'bad',
};
const STATUS_TONES: Record<NoticeStatus, ChipTone> = {
  [NoticeStatus.Draft]: 'mute',
  [NoticeStatus.Scheduled]: 'info',
  [NoticeStatus.Live]: 'ok',
  [NoticeStatus.Ended]: 'mute',
  [NoticeStatus.Withdrawn]: 'bad',
};

export function SeverityChip({ severity }: { severity: NoticeSeverity }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <StatusChip tone={SEVERITY_TONES[severity]} plain>
      {t(`notices.severities.${severity}`)}
    </StatusChip>
  );
}

export function NoticeStatusChip({ status }: { status: NoticeStatus }): React.JSX.Element {
  const { t } = useTranslation();
  return <StatusChip tone={STATUS_TONES[status]}>{t(`notices.statuses.${status}`)}</StatusChip>;
}

/** The pin a pinned notice carries before its title. */
export function PinMark({ pinned }: { pinned: boolean }): React.JSX.Element | null {
  const { t } = useTranslation();
  if (!pinned) return null;
  return (
    <span title={t('notices.pinned')} className="mr-1 inline-flex align-[-2px] text-accent-text">
      <ConsoleIcon name="tack" size={15} />
    </span>
  );
}

function PlansAudience({ ids }: { ids: readonly string[] }): React.JSX.Element {
  const { t } = useTranslation();
  const plans = usePlans();
  const names = ids.map((id) => plans.data?.find((plan) => plan.id === id)?.name ?? '…');
  return <>{t('notices.audPlans', { p: names.join(', ') })}</>;
}

function ShopAudience({ id }: { id: string }): React.JSX.Element {
  const { t } = useTranslation();
  const shop = useShop(id);
  return <>{t('notices.audTenant', { s: shop.data?.shopName ?? '…' })}</>;
}

/** NTC-02: who a notice is for, in words: "Plans: Starter, Growth", "One shop: Dhaka Gadget House". */
export function AudienceWords({ audience }: { audience: NoticeAudience }): React.JSX.Element {
  const { t } = useTranslation();
  switch (audience.kind) {
    case NoticeAudienceKind.All:
      return <>{t('notices.audAll')}</>;
    case NoticeAudienceKind.Plans:
      return <PlansAudience ids={audience.planIds} />;
    case NoticeAudienceKind.States:
      return (
        <>
          {t('notices.audStates', {
            s: audience.states.map((state) => t(`states.${state}`)).join(', '),
          })}
        </>
      );
    case NoticeAudienceKind.Tenant:
      return <ShopAudience id={audience.tenantId} />;
  }
}
