import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTakaExact } from '@lytronix/ui';
import { Permission, type SmsEvent } from '@lytronix/validators';
import { useSmsSettings } from '@/api/sms';
import { Icon } from '@/components/icon';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { EVENT_WORDS } from './sms-words';

/**
 * The SMS an action sends (Part 37's `.p37smsline`, D7-20): what the customer gets and what it costs from the balance, with
 * the way to SMS settings, while its switch is on; Cancel's also says when it is off. Only for those who may read SMS
 * settings.
 */
export function SmsLine({
  event,
  words,
  values = {},
  saysOff = false,
  className = '',
}: {
  event: SmsEvent;
  /** The line in the orders dictionary, its cost in `{{c}}` (or `{{m}}` where `{{c}}` names a courier). */
  words: string;
  values?: Record<string, string>;
  /** Cancel's line says the SMS is off (`p37-o-cancel-off`); the others show only while it is on (§7.40). */
  saysOff?: boolean;
  className?: string;
}): React.JSX.Element | null {
  const { t } = useTranslation('orders');
  const { t: menu } = useTranslation('menu');
  const { slug, viewer } = useShell();
  const settings = useSmsSettings({ enabled: allows(viewer, [Permission.SmsRead]) });
  const setting = settings.data?.events.find((each) => each.event === event);
  if (!settings.data || !setting || (!setting.on && !saysOff)) return null;
  const cost = `${formatTakaExact(setting.units * Number(settings.data.rate))} ${t('p37LineFrom')}`;
  const text = setting.on
    ? t(words, { c: cost, m: cost, ...values })
    : t('p37LineOff', { e: menu(EVENT_WORDS[event][0]) });
  return (
    <div
      className={`flex items-start gap-2 rounded-[8px] bg-neutral-50 px-3 py-2.5 text-[13px] leading-[1.5] text-neutral-700 ${className}`}
    >
      <span className="mt-0.5 flex-none text-neutral-700">
        <Icon name="sms" size={16} />
      </span>
      <span>
        {text} ·{' '}
        <Link
          to="/$shop/settings/sms"
          params={{ shop: slug }}
          className="font-semibold whitespace-nowrap text-primary underline"
        >
          {t('sSms', { ns: 'shell' })}
        </Link>
      </span>
    </div>
  );
}
