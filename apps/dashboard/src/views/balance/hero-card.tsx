import { useTranslation } from 'react-i18next';
import { Button, Icon } from '@lytronix/ui';
import type { BalanceSnapshot, EssentialSmsUsage } from '@/types/balance';

interface HeroCardProps {
  balance: BalanceSnapshot;
  sms: EssentialSmsUsage | undefined;
  canTopUp: boolean;
  onTopUp: () => void;
}

function splitTaka(amount: string): { whole: string; paisa: string | null } {
  const value = Number(amount);
  if (!Number.isFinite(value)) return { whole: '৳0', paisa: null };
  const whole = Math.trunc(Math.abs(value));
  const paisa = Math.round((Math.abs(value) - whole) * 100);
  return {
    whole: `${value < 0 ? '−' : ''}৳${whole.toLocaleString('en-US')}`,
    paisa: paisa > 0 ? `.${String(paisa).padStart(2, '0')}` : null,
  };
}

/** The number first (rule 1): the balance large with paisa small, the free-SMS bar, Top up in marigold. A
    frozen balance (BAL-08) turns the card neutral, labels it and says what reopens it (LIF-15). */
export function HeroCard({ balance, sms, canTopUp, onTopUp }: HeroCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const amount = splitTaka(balance.amount);
  const smsPercent =
    sms && sms.monthlyLimit !== null && sms.monthlyLimit > 0
      ? Math.min(100, Math.round((sms.monthlyUsed / sms.monthlyLimit) * 100))
      : null;

  return (
    <section
      className={`rounded-card p-4 text-white sm:p-5 ${
        balance.frozen
          ? 'bg-neutral-700'
          : 'bg-[linear-gradient(135deg,var(--color-brand-900),var(--color-brand-700))]'
      }`}
    >
      <div className="flex items-center justify-between gap-3 text-[13px] text-brand-100">
        <span>{t('nav.balance')}</span>
        {balance.frozen ? (
          <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-bold text-white">
            {t('balance.frozen')}
          </span>
        ) : null}
      </div>
      <p className="num mt-1 text-[36px] leading-none font-bold tracking-tight lg:text-[44px]">
        {amount.whole}
        {amount.paisa ? (
          <span className="ml-1 text-[16px] font-medium text-brand-200">{amount.paisa}</span>
        ) : null}
      </p>
      {sms ? (
        <div className="mt-4 text-[13px] text-brand-100">
          <div className="flex justify-between gap-3">
            <span>{t('balance.freeSmsMonth')}</span>
            <b className="num text-white">
              {sms.monthlyUsed} / {sms.monthlyLimit === null ? '∞' : sms.monthlyLimit}
            </b>
          </div>
          {smsPercent !== null ? (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20">
              <i
                className="block h-full rounded-full bg-accent-300"
                style={{ width: `${String(smsPercent)}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {balance.frozen ? (
        <p className="mt-4 text-[14px] text-neutral-200">{t('balance.frozenNote')}</p>
      ) : canTopUp ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" tone="accent" fit onClick={onTopUp}>
            <Icon name="arrow" size={18} />
            {t('balance.topUp')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
