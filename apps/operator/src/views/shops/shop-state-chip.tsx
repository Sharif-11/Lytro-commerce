import { useTranslation } from 'react-i18next';
import { TenantState } from '@lytronix/validators';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';

const TONES: Record<TenantState, ChipTone> = {
  [TenantState.Trial]: 'info',
  [TenantState.PayAsYouGo]: 'info',
  [TenantState.Active]: 'ok',
  [TenantState.Grace]: 'warn',
  [TenantState.ReadOnly]: 'warn',
  [TenantState.Locked]: 'bad',
  [TenantState.Archived]: 'mute',
  [TenantState.Deleted]: 'mute',
};

/** A shop's lifecycle state, one colour for each meaning. */
export function ShopStateChip({ state }: { state: TenantState }): React.JSX.Element {
  const { t } = useTranslation();
  return <StatusChip tone={TONES[state]}>{t(`states.${state}`)}</StatusChip>;
}
