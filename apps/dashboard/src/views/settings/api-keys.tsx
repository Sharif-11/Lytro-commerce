import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiKeyPurpose, Permission, UsageMetric } from '@lytronix/validators';
import { useApiKeys } from '@/api/api-keys';
import { useUsage } from '@/api/usage';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { rowClass, RowList } from '@/components/ui/list-row';
import { StatusTag } from '@/components/ui/status-tag';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { ApiKey, CreatedApiKey } from '@/types/api-key';
import { ApiChargesSection } from './api-charges';
import { CreatedKeySheet, EditKeySheet, NewKeySheet, RevokeKeySheet } from './api-key-sheets';
import { keyLine } from './api-key-words';
import './developers/developers.css';
import { WORDS } from './developers/words';

/**
 * API keys (TENANT-DASHBOARD-DESIGN §7.26, the prototype's `api-keys` and its sheets): what a key is for, the keys
 * with their first characters, websites, last use and expiry, a revoked one kept and greyed; New key, a live key's
 * edit, and Revoke. The requests counted this cycle show to whoever may read the shop's usage (Slice 11.6). The key
 * Lytro keeps for the storefront comes first, marked Lytro's, with nothing to change or revoke (Part 25, Slice 12a).
 */
export function ApiKeysView(): React.JSX.Element {
  const { t, i18n } = useTranslation('menu');
  const { tenant, viewer } = useShell();
  const words = (pair: readonly [string, string]): string =>
    i18n.language === 'en' ? pair[1] : pair[0];
  const keys = useApiKeys();
  const usage = useUsage({ enabled: allows(viewer, [Permission.PaymentsRead]) });
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const requests = usage.data?.metrics.find((each) => each.metric === UsageMetric.Requests);
  const isLytros = (key: ApiKey) => key.purpose === ApiKeyPurpose.Storefront;
  const listed = keys.data
    ? [...keys.data].sort((a, b) => Number(isLytros(b)) - Number(isLytros(a)))
    : undefined;

  return (
    <ShellPage
      actions={
        <Button
          size="sm"
          onClick={() => {
            setAdding(true);
          }}
        >
          <Icon name="plus" />
          {t('akNew')}
        </Button>
      }
    >
      <p className="text-[14px] text-fg-muted">{t('akLead')}</p>
      {/* §7.48: the Developer docs card under the lead. */}
      <Link
        to="/$shop/settings/developers"
        params={{ shop: tenant.slug }}
        className="dv-entry rounded-card border border-line bg-surface p-4"
      >
        <span className="dv-ei">
          <Icon name="code" />
        </span>
        <span className="dv-eb">
          <span className="l1">{words(WORDS.entryTitle)}</span>
          <span className="l2">{words(WORDS.entryBody)}</span>
        </span>
        <Icon name="right" size={18} />
      </Link>
      <ApiChargesSection />
      {keys.isError ? <ErrorBanner error={keys.error} /> : null}
      {listed ? (
        <Card flush>
          {listed.length === 0 ? (
            <EmptyState icon="key">{t('akEmpty')}</EmptyState>
          ) : (
            <RowList>
              {listed.map((key) => {
                const revoked = key.revokedAt !== null;
                const lytros = isLytros(key);
                const body = (
                  <>
                    <span className="flex size-10 flex-none items-center justify-center rounded-button bg-neutral-100 text-fg-muted">
                      <Icon name={lytros ? 'globe' : 'key'} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="min-w-0 overflow-hidden text-[16px] font-medium text-ellipsis whitespace-nowrap">
                        {lytros ? t('akStorefront') : key.name}
                        {lytros ? (
                          <>
                            {' '}
                            <StatusTag tone="info">{t('akLytros')}</StatusTag>
                          </>
                        ) : null}
                        {revoked ? (
                          <>
                            {' '}
                            <StatusTag tone="neutral">{t('akRevoked')}</StatusTag>
                          </>
                        ) : null}
                      </span>
                      <span className="overflow-hidden text-[14px] text-ellipsis whitespace-nowrap text-fg-muted">
                        {keyLine(key, t)}
                      </span>
                    </span>
                  </>
                );
                if (lytros) {
                  return (
                    <div key={key.id} className={rowClass}>
                      {body}
                    </div>
                  );
                }
                return revoked ? (
                  <div key={key.id} aria-disabled="true" className={`${rowClass} opacity-55`}>
                    {body}
                  </div>
                ) : (
                  <div key={key.id} className={`${rowClass} p-0!`}>
                    <button
                      type="button"
                      className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left"
                      onClick={() => {
                        setEditing(key);
                      }}
                    >
                      {body}
                    </button>
                    <Button
                      tone="ghost"
                      size="xs"
                      className="mr-2 flex-none"
                      onClick={() => {
                        setRevoking(key);
                      }}
                    >
                      {t('akRevoke')}
                    </Button>
                  </div>
                );
              })}
            </RowList>
          )}
        </Card>
      ) : null}
      {listed?.some(isLytros) ? (
        <p className="text-[14px] text-fg-muted">{t('akStorefrontNote')}</p>
      ) : null}
      {/* §7.48 (`dev-keys-none`): no key of the shop's own yet, under Lytro's storefront key. */}
      {listed?.some(isLytros) && !listed.some((key) => !isLytros(key)) ? (
        <Card>
          <EmptyState
            icon="key"
            action={
              <Button
                size="sm"
                onClick={() => {
                  setAdding(true);
                }}
              >
                <Icon name="plus" />
                {t('akNew')}
              </Button>
            }
          >
            {words(WORDS.noOwnKey)}
          </EmptyState>
        </Card>
      ) : null}
      {requests ? (
        <Card>
          <p className="text-[15px] text-fg-muted">
            {t('akLimit', {
              requests:
                requests.limit === null
                  ? requests.used.toLocaleString('en-US')
                  : `${requests.used.toLocaleString('en-US')} / ${requests.limit.toLocaleString('en-US')}`,
            })}
          </p>
        </Card>
      ) : null}

      <NewKeySheet
        open={adding}
        onClose={() => {
          setAdding(false);
        }}
        onCreated={(key) => {
          setAdding(false);
          setCreated(key);
        }}
      />
      <CreatedKeySheet
        created={created}
        onClose={() => {
          setCreated(null);
        }}
      />
      <EditKeySheet
        editing={editing}
        onClose={() => {
          setEditing(null);
        }}
        onSaved={() => {
          setEditing(null);
          toast.show(t('saved'));
        }}
      />
      <RevokeKeySheet
        revoking={revoking}
        onClose={() => {
          setRevoking(null);
        }}
        onRevoked={() => {
          setRevoking(null);
          toast.show(t('akRevokedToast'));
        }}
      />
      <Toast message={toast.message} />
    </ShellPage>
  );
}
