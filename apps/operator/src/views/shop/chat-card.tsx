import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { ChatFeatureMode } from '@lytronix/validators';
import { useChatFeature, useSetChatFeature } from '@/api/chats';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsoleCard } from '@/components/ui/console-page';
import { useToast } from '@/components/ui/use-toast';

const MODES: readonly ChatFeatureMode[] = [
  ChatFeatureMode.Plan,
  ChatFeatureMode.On,
  ChatFeatureMode.Off,
];
const MODE_OF = new Map<string, ChatFeatureMode>(MODES.map((mode) => [mode, mode]));

/**
 * LIVE-CHAT-PLAN LC-2 (the sketch's `oc-shop-features`, PR 1's chat row): the shop's own chat setting -- as its plan, on
 * or off for this shop -- which wins over the plan; changing it is on Lytro's audit log, and switching it off closes the
 * shop's open chat at once.
 */
export function ChatCard({
  shopId,
  planName,
}: {
  shopId: string;
  planName: string | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const feature = useChatFeature(shopId);
  const set = useSetChatFeature(shopId);
  const state = feature.data;
  const plan = planName ?? '—';

  return (
    <ConsoleCard>
      <h2 className="mb-1 flex items-center gap-2 text-[16px] font-semibold">
        <ConsoleIcon name="chat" size={18} />
        {t('shopChat.title')}
      </h2>
      <div className="flex min-h-[52px] flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex min-w-0 flex-[1_1_220px] flex-col">
          <b className="text-[14px] font-semibold">{t('shopChat.chat')}</b>
          <span className="text-[13px] text-fg-muted">
            {state
              ? t(state.plan ? 'shopChat.planOn' : 'shopChat.planOff', { plan })
              : t('common.loading')}
          </span>
        </span>
        <select
          aria-label={t('shopChat.chat')}
          value={state?.mode ?? ChatFeatureMode.Plan}
          disabled={!state || set.isPending}
          onChange={(event) => {
            const mode = MODE_OF.get(event.target.value);
            if (mode === undefined) return;
            set.mutate(mode, {
              onSuccess: (next) => {
                toast(t(next.on ? 'shopChat.savedOn' : 'shopChat.savedOff'));
              },
              onError: (error) => {
                toast(errorMessage(error, t));
              },
            });
          }}
          className="ml-auto h-10 min-w-[200px] rounded-control border border-line-strong bg-surface px-3 text-[14px]"
        >
          {MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode === ChatFeatureMode.Plan
                ? t(state?.plan ? 'shopChat.asPlanOn' : 'shopChat.asPlanOff')
                : t(`shopChat.modes.${mode}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2">
        <Link
          to="/inbox/$tenantId"
          params={{ tenantId: shopId }}
          className="inline-flex h-9 items-center gap-2 rounded-control border border-line-strong px-3 text-[14px] font-semibold"
        >
          <ConsoleIcon name="chat" size={16} />
          {t('shopChat.open')}
        </Link>
      </div>
    </ConsoleCard>
  );
}
