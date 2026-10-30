import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { useAddDomain, useCheckDomain, useDomain, useRemoveDomain } from '@/api/domain';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Kv } from '@/components/ui/kv';
import { StatusTag, type StatusTone } from '@/components/ui/status-tag';
import { Toast } from '@/components/ui/toast';
import { useErrorText } from '@/hooks/use-error-text';
import { useToast } from '@/hooks/use-toast';
import { appConfig } from '@/lib/app-config';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { DomainRecord, ShopDomain } from '@/types/domain';

// An out-of-card heading as the sketch draws it: the browser's own h3 over its 14 px text.
const SUBHEAD = 'text-[16.38px] font-bold';

const HEAD: Record<ShopDomain['state'], { word: string; tone: StatusTone; hint: string }> = {
  pending: { word: 'dmWaiting', tone: 'warn', hint: 'dmWaitHint' },
  failed: { word: 'dmFailed', tone: 'bad', hint: 'dmFailedHint' },
  active: { word: 'dmActive', tone: 'ok', hint: 'dmActiveHint' },
  off: { word: 'dmOff', tone: 'neutral', hint: 'dmOffHint' },
};

/**
 * Your own domain (TENANT-DASHBOARD-DESIGN §7.30, the prototype's Part 28: `dom28-offer`, `dom28`, `dom28-format`,
 * `dom28-taken`, `dom28-pending`, `dom28-pending-www`, `dom28-checked`, `dom28-active`, `dom28-failed`, `dom28-lost`,
 * `dom28-inactive`, `sh-dom28-remove`): a Growth or Pro shop's own domain (TEN-09 to TEN-14). Added, it waits for the
 * records shown, each with Copy value, and is checked every 10 minutes or at Check now; active, it is the shop's main
 * address. A plan without it sees the offer (TEN-10); a downgrade keeps it, off (DWN-10). Removing it asks first.
 */
export function DomainView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const { slug, showToast } = useShell();
  const navigate = useNavigate();
  const domain = useDomain();
  const check = useCheckDomain();
  const remove = useRemoveDomain();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const address = appConfig.shopHost(slug);
  const view = domain.data;
  const current = view?.domain ?? null;

  function checkNow(): void {
    check.mutate(undefined, {
      onSuccess: (next) => {
        const now = next.domain;
        if (now?.state === 'active') toast.show(t('dmActiveNow', { domain: now.hostname }));
        else toast.show(t('dmChecked'));
      },
    });
  }

  function removeIt(hostname: string): void {
    remove.mutate(undefined, {
      onSuccess: () => {
        setAsking(false);
        showToast(t('dmRemoved', { domain: hostname }));
        void navigate({ to: '/$shop/settings/storefront', params: { shop: slug } });
      },
    });
  }

  const removeButton = (
    <div>
      <Button
        tone="outline"
        onClick={() => {
          setAsking(true);
        }}
      >
        {t('dmRemove')}
      </Button>
    </div>
  );
  const seePlans = (
    <div>
      <Link to="/$shop/plan" params={{ shop: slug }} className={buttonClass('primary', 'sm')}>
        {t('seePlans', { ns: 'shell' })}
      </Link>
    </div>
  );

  return (
    <ShellPage>
      {domain.isError ? <Banner tone="bad">{errorText(domain.error)}</Banner> : null}
      {check.isError ? <Banner tone="bad">{errorText(check.error)}</Banner> : null}
      {remove.isError ? <Banner tone="bad">{errorText(remove.error)}</Banner> : null}
      {view ? (
        <div className="flex max-w-[640px] flex-col gap-[14px]">
          {current === null ? (
            view.allowed ? (
              <AddDomain address={address} />
            ) : (
              <Card className="flex flex-col gap-2.5">
                <h3 className="text-[17px] font-semibold">{t('dmOfferT')}</h3>
                <p className="text-[14px] text-fg-muted">{t('dmOfferP', { address })}</p>
                {seePlans}
              </Card>
            )
          ) : (
            <>
              <Card className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="min-w-0 text-[17px] font-semibold break-all">
                    {current.hostname}
                  </h3>
                  <StatusTag tone={HEAD[current.state].tone}>
                    {t(HEAD[current.state].word)}
                  </StatusTag>
                </div>
                <p className="text-[14px] text-fg-muted">
                  {current.state === 'active'
                    ? t(current.twinActive ? 'dmActiveHint' : 'dmActiveHintSolo', {
                        domain: current.hostname,
                        address,
                        twin: current.twin,
                      })
                    : t(HEAD[current.state].hint)}
                </p>
                {current.lost && current.state === 'pending' ? (
                  <Banner tone="warn">{t('dmLost', { address })}</Banner>
                ) : null}
                {current.state === 'off' ? seePlans : null}
              </Card>
              {current.state === 'pending' || current.state === 'failed' ? (
                <>
                  <Records domain={current} />
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={check.isPending} onClick={checkNow}>
                      {t('dmCheckNow')}
                    </Button>
                    <Button
                      tone="outline"
                      onClick={() => {
                        setAsking(true);
                      }}
                    >
                      {t('dmRemove')}
                    </Button>
                  </div>
                </>
              ) : (
                removeButton
              )}
            </>
          )}
        </div>
      ) : null}
      {current ? (
        <Dialog
          open={asking}
          title={t('dmRemoveT', { domain: current.hostname })}
          onClose={() => {
            setAsking(false);
          }}
          actions={
            <>
              <Button
                tone="outline"
                onClick={() => {
                  setAsking(false);
                }}
              >
                {t('cancel')}
              </Button>
              <Button
                tone="danger"
                disabled={remove.isPending}
                onClick={() => {
                  removeIt(current.hostname);
                }}
              >
                {t('dmRemove')}
              </Button>
            </>
          }
        >
          {t('dmRemoveCons', { domain: current.hostname, address })}
        </Dialog>
      ) : null}
      <Toast message={toast.message} icon="info" />
    </ShellPage>
  );
}

/** The field for the domain the seller bought, refused under it when it is not one or another shop has it. */
function AddDomain({ address }: { address: string }): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const add = useAddDomain();
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: React.SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    setProblem(null);
    add.mutate(typed, {
      onError: (error) => {
        const said = error instanceof ApiClientError ? error.fieldProblems().hostname : undefined;
        setProblem(said ?? null);
      },
    });
  }

  return (
    <>
      {add.isError && problem === null ? <Banner tone="bad">{errorText(add.error)}</Banner> : null}
      <p className="text-[14px]">{t('dmIntro', { address })}</p>
      <Card>
        <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
          <Field
            label={t('dmField')}
            name="hostname"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="megh.com"
            value={typed}
            help={t('dmFieldHelp')}
            error={problem}
            onChange={(event) => {
              setTyped(event.target.value);
              setProblem(null);
            }}
          />
          <div>
            <Button type="submit" disabled={add.isPending || typed.trim() === ''}>
              {t('dmAdd')}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}

/** The records to add, each a card with Copy value, then the twin's apart: optional, it leads the twin here too. */
function Records({ domain }: { domain: ShopDomain }): React.JSX.Element {
  const { t } = useTranslation('menu');
  return (
    <>
      <h3 className={`${SUBHEAD} mt-1`}>{t('dmAddThese')}</h3>
      {domain.records.map((record) => (
        <RecordCard key={`${record.type} ${record.name} ${record.value}`} record={record} />
      ))}
      <h3 className={`${SUBHEAD} mt-2`}>{t('dmTwinT', { domain: domain.twin })}</h3>
      <p className="text-[14px]">
        {t('dmTwinHint', { domain: domain.twin, main: domain.hostname })}
      </p>
      {domain.twinRecords.map((record) => (
        <RecordCard key={`${record.type} ${record.name} ${record.value}`} record={record} />
      ))}
    </>
  );
}

function RecordCard({ record }: { record: DomainRecord }): React.JSX.Element {
  const { t } = useTranslation('menu');
  const [copied, setCopied] = useState(false);
  return (
    <Card flush className="flex flex-col gap-0.5 px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <b className="text-[14px]">{record.type}</b>
        <Button
          tone="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(record.value).then(() => {
              setCopied(true);
            });
          }}
        >
          <Icon name="copy" />
          {copied ? t('dmCopied') : t('dmCopy')}
        </Button>
      </div>
      <Kv label={t('dmName')} value={<span className="break-all">{record.name}</span>} />
      <Kv label={t('dmValue')} value={<span className="break-all">{record.value}</span>} />
    </Card>
  );
}
