import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { useNetState } from '@/hooks/use-net-state';

/**
 * Fixes · UI/UX batch 2, item 1.1 (the prototype's `ux-offline`, `ux-online-back`): a bar under the app bar on every page
 * while the connection is gone, in place of the banner the page used to carry. What was already loaded stays readable
 * under it; Try again reads the page again. When the connection returns, "Back online" in green for a moment.
 */
export function NetBar(): React.JSX.Element | null {
  const { t } = useTranslation('shell');
  const queryClient = useQueryClient();
  const state = useNetState();
  if (state === 'online') return null;
  if (state === 'back') {
    return (
      <div
        role="status"
        className="flex flex-none items-center gap-2.5 bg-success-soft px-4 py-2.5 text-[14px] leading-[1.4] text-success lg:px-8"
      >
        <Icon name="wifi" className="flex-none" />
        <span className="min-w-0 flex-1">
          <b>{t('ux2.netBack')}</b> · {t('ux2.netBackSub')}
        </span>
      </div>
    );
  }
  return (
    <div
      role="status"
      className="flex flex-none items-center gap-2.5 bg-ink px-4 py-2.5 text-[14px] leading-[1.4] text-white lg:px-8"
    >
      <Icon name="wifioff" className="flex-none" />
      <span className="min-w-0 flex-1">
        <b>{t('ux2.netOff')}</b> · {t('ux2.netOffSub')}
      </span>
      <button
        type="button"
        className="min-h-9 flex-none rounded-[8px] border border-white/50 px-3 text-[14px] font-semibold"
        onClick={() => {
          void queryClient.refetchQueries({ type: 'active' });
        }}
      >
        {t('ux2.retry')}
      </button>
    </div>
  );
}
