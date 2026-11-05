import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button, ErrorBanner } from '@lytronix/ui';
import { usePairingCode } from '@/api/phones';
import { chipClass } from '@/components/ui/chip-class';
import { Chips } from '@/components/ui/chips';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsoleCard, PageTitle } from '@/components/ui/console-page';
import { Panel } from '@/components/ui/panel';
import { formatSessionTime } from '@/lib/session-time';

/** PAY-21: a code for one more of Lytro's phones, asked for as the panel opens. */
function PairPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const pairing = usePairingCode();
  const { mutate } = pairing;

  useEffect(() => {
    mutate();
  }, [mutate]);

  return (
    <Panel
      open
      title={t('phones.pair')}
      sub={t('phones.pairLead')}
      onClose={onClose}
      footerInRow
      footer={
        <>
          <Button
            type="button"
            tone="outline"
            small
            fit
            loading={pairing.isPending}
            className="flex-1 sm:flex-none"
            onClick={() => {
              mutate();
            }}
          >
            {t('phones.pairNew')}
          </Button>
          <Button type="button" small fit className="flex-1 sm:flex-none" onClick={onClose}>
            {t('phones.pairDone')}
          </Button>
        </>
      }
    >
      <ol className="ml-[18px] flex list-decimal flex-col gap-1.5">
        <li>{t('phones.pairStep1')}</li>
        <li>{t('phones.pairStep2')}</li>
      </ol>
      {pairing.isError ? <ErrorBanner message={t('phones.pairFailed')} /> : null}
      <ConsoleCard className="text-center">
        <div className="text-[13px] text-fg-muted">{t('phones.pairCode')}</div>
        <div className="mono my-2 text-[30px] font-semibold tracking-[0.14em]">
          {pairing.data?.code ?? '—'}
        </div>
        {pairing.data ? (
          <div className="text-[13px] text-fg-muted">
            {t('phones.pairExpires', { d: formatSessionTime(pairing.data.expiresAt) })}
          </div>
        ) : null}
      </ConsoleCard>
    </Panel>
  );
}

const TABS = [
  { to: '/phones', key: 'phones', word: 'phones.tabPhones' },
  { to: '/phones/receipts', key: 'receipts', word: 'phones.tabReceipts' },
  { to: '/phones/unread', key: 'unread', word: 'phones.tabUnread' },
] as const;

/** The head the three screens of Lytro's phones share: the title, pairing, and the way between them. */
export function PhonesHead({
  active,
}: {
  active: (typeof TABS)[number]['key'];
}): React.JSX.Element {
  const { t } = useTranslation();
  const [pairing, setPairing] = useState(false);
  return (
    <>
      <PageTitle
        title={t('nav.phones')}
        lead={t('phones.lead')}
        actions={
          <Button
            type="button"
            small
            fit
            className="flex-[1_1_auto] sm:flex-none"
            onClick={() => {
              setPairing(true);
            }}
          >
            <ConsoleIcon name="plus" size={18} />
            {t('phones.pair')}
          </Button>
        }
      />
      <Chips>
        {TABS.map((tab) => (
          <Link key={tab.key} to={tab.to} className={chipClass(active === tab.key)}>
            {t(tab.word)}
          </Link>
        ))}
      </Chips>
      {pairing ? (
        <PairPanel
          onClose={() => {
            setPairing(false);
          }}
        />
      ) : null}
    </>
  );
}
