import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button, ErrorBanner } from '@lytronix/ui';
import { PlatformSettingKey, TenantState } from '@lytronix/validators';
import { useSettings } from '@/api/settings';
import { useCredentialUses, useRestorePage, useSetNewShopCap } from '@/api/shops';
import { ActionPanel } from '@/components/ui/action-panel';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { Consequence } from '@/components/ui/consequence';
import { ConsoleCard } from '@/components/ui/console-page';
import { KeyValue, KeyValues } from '@/components/ui/key-values';
import { CardList, LIST_ROW, RowLines } from '@/components/ui/list-row';
import { ReasonField } from '@/components/ui/reason-field';
import { SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { useToast } from '@/components/ui/use-toast';
import { formatDay, taka } from '@/lib/format';
import { formatSessionTime } from '@/lib/session-time';
import type { OperatorShop } from '@/types/operator';
import { SuspendPagePanel } from './suspend-page-panel';

type CapChoice = 'kind' | 'on' | 'off';

function choiceOf(set: boolean | null): CapChoice {
  if (set === null) return 'kind';
  return set ? 'on' : 'off';
}

const CAP_VALUES: Record<CapChoice, boolean | null> = { kind: null, on: true, off: false };

/** TVR-04: the new-shop cap, as the shop's kind says or set for this one shop. */
function CapPanel({
  shop,
  amount,
  days,
  onClose,
}: {
  shop: OperatorShop;
  amount: string;
  days: number;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const setCap = useSetNewShopCap();
  const [choice, setChoice] = useState<CapChoice>(choiceOf(shop.newShopCap.set));
  const [reason, setReason] = useState('');
  const options: [CapChoice, string][] = [
    ['kind', t(shop.state === TenantState.PayAsYouGo ? 'shop.capDefaultOn' : 'shop.capDefaultOff')],
    ['on', t('shop.capForceOn')],
    ['off', t('shop.capForceOff')],
  ];
  return (
    <ActionPanel
      title={t('shop.capTitle', { shop: shop.shopName })}
      onClose={onClose}
      actionLabel={t('common.save')}
      pending={setCap.isPending}
      canSubmit={reason.trim() !== ''}
      error={setCap.isError ? errorMessage(setCap.error, t) : null}
      onSubmit={() => {
        setCap.mutate(
          { shopId: shop.id, capped: CAP_VALUES[choice], reason: reason.trim() },
          {
            onSuccess: () => {
              toast(t('shop.capSaved'));
              onClose();
            },
          },
        );
      }}
    >
      <Consequence>{t('shop.capConsequence', { n: days, a: amount })}</Consequence>
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">{t('shop.cap')}</legend>
        {options.map(([value, label]) => (
          <label key={value} className="flex cursor-pointer items-center gap-2.5 text-[14px]">
            <input
              type="radio"
              name="cap"
              checked={choice === value}
              onChange={() => {
                setChoice(value);
              }}
              className="peer sr-only"
            />
            <span className="flex size-5 flex-none items-center justify-center rounded-[5px] border-[1.5px] border-line-strong bg-surface text-white peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-focus">
              {choice === value ? <ConsoleIcon name="check" size={14} /> : null}
            </span>
            {label}
          </label>
        ))}
      </fieldset>
      <ReasonField value={reason} onChange={setReason} />
    </ActionPanel>
  );
}

function RestorePagePanel({
  shop,
  onClose,
}: {
  shop: OperatorShop;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const restore = useRestorePage();
  const [reason, setReason] = useState('');
  return (
    <ActionPanel
      title={t('shop.pageRestoreTitle', { shop: shop.shopName })}
      onClose={onClose}
      actionLabel={t('shop.pageRestoreButton')}
      pending={restore.isPending}
      canSubmit={reason.trim() !== ''}
      error={restore.isError ? errorMessage(restore.error, t) : null}
      onSubmit={() => {
        restore.mutate(
          { shopId: shop.id, reason: reason.trim() },
          {
            onSuccess: () => {
              toast(t('shop.pageRestored', { shop: shop.shopName }));
              onClose();
            },
          },
        );
      }}
    >
      <Consequence tone="ok">{t('shop.pageRestoreConsequence')}</Consequence>
      <KeyValues>
        <KeyValue label={t('shop.suspendedFor')}>
          {shop.paymentPageSuspension?.reason ?? '—'}
        </KeyValue>
      </KeyValues>
      <ReasonField value={reason} onChange={setReason} />
    </ActionPanel>
  );
}

/** Its payment page, new-shop cap and credential log (TVR-03, TVR-04, SEC-11). */
export function PaymentsCard({ shop }: { shop: OperatorShop }): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const settings = useSettings();
  const lastUse = useCredentialUses(shop.id, 1, 1);
  const [panel, setPanel] = useState<'suspend' | 'restore' | 'cap' | null>(null);
  const settingOf = (key: string) =>
    settings.data?.find((setting) => setting.key === key)?.value ?? 0;
  const capAmount = taka(String(settingOf(PlatformSettingKey.NewShopPaymentCapAmount)));
  const capDays = Number(settingOf(PlatformSettingKey.NewShopPaymentCapDays));
  const pageOff = shop.paymentPageSuspension;
  const last = lastUse.data?.uses[0];

  function close(): void {
    setPanel(null);
  }

  return (
    <ConsoleCard>
      <h2 className="mb-1 text-[16px] font-semibold">{t('shop.payments')}</h2>
      {settings.isError ? <ErrorBanner message={errorMessage(settings.error, t)} /> : null}
      <CardList>
        <div className={LIST_ROW}>
          <RowLines
            wrap
            title={
              <>
                {t('shop.page')}{' '}
                {pageOff ? (
                  <StatusChip tone="bad">{t('shop.pageOff')}</StatusChip>
                ) : (
                  <StatusChip tone="ok">{t('shop.pageLive')}</StatusChip>
                )}
              </>
            }
            detail={
              pageOff
                ? t('shop.pageOffNote', { d: formatDay(pageOff.at), r: pageOff.reason ?? '—' })
                : undefined
            }
          />
          <Button
            type="button"
            tone="outline"
            small
            fit
            className={SMALL_BUTTON}
            onClick={() => {
              setPanel(pageOff ? 'restore' : 'suspend');
            }}
          >
            <ConsoleIcon name={pageOff ? 'play' : 'pause'} size={18} />
            {pageOff ? t('shop.pageRestore') : t('shop.pageSuspend')}
          </Button>
        </div>
        <div className={LIST_ROW}>
          <RowLines
            wrap
            title={
              <>
                {t('shop.cap')}{' '}
                <StatusChip tone="mute" plain>
                  {shop.newShopCap.holds ? t('shop.capOn') : t('shop.capOff')}
                </StatusChip>
              </>
            }
            detail={`${shop.newShopCap.set === null ? t('shop.capByKind') : t('shop.capByOperator')} · ${t(
              'shop.capLine',
              { a: capAmount, n: capDays },
            )}`}
          />
          <Button
            type="button"
            tone="outline"
            small
            fit
            className={SMALL_BUTTON}
            onClick={() => {
              setPanel('cap');
            }}
          >
            {t('shop.change')}
          </Button>
        </div>
        <div className={LIST_ROW}>
          <RowLines
            wrap
            title={t('shop.credentials')}
            detail={`${t('shop.credentialsHint')}${
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
              void navigate({ to: '/shops/$id/credentials', params: { id: shop.id } });
            }}
          >
            {t('shop.credentialsOpen')}
          </Button>
        </div>
      </CardList>
      {panel === 'suspend' ? (
        <SuspendPagePanel
          shop={{ id: shop.id, name: shop.shopName, slug: shop.slug }}
          onClose={close}
        />
      ) : null}
      {panel === 'restore' ? <RestorePagePanel shop={shop} onClose={close} /> : null}
      {panel === 'cap' ? (
        <CapPanel shop={shop} amount={capAmount} days={capDays} onClose={close} />
      ) : null}
    </ConsoleCard>
  );
}
