import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Permission, UsageMetric } from '@lytronix/validators';
import { useApiKeys } from '@/api/api-keys';
import { useUsage } from '@/api/usage';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { rowClass, RowList } from '@/components/ui/list-row';
import { StatusTag } from '@/components/ui/status-tag';
import { Toast } from '@/components/ui/toast';
import { useErrorText } from '@/hooks/use-error-text';
import { useToast } from '@/hooks/use-toast';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { ApiKey, CreatedApiKey } from '@/types/api-key';
import { CreatedKeySheet, EditKeySheet, NewKeySheet, RevokeKeySheet } from './api-key-sheets';
import { keyLine } from './api-key-words';

/**
 * API keys (TENANT-DASHBOARD-DESIGN §7.26, the prototype's `api-keys` and its sheets): what a key is for, the keys
 * with their first characters, websites, last use and expiry, a revoked one kept and greyed; New key, a live key's
 * edit, and Revoke. The requests counted this cycle show to whoever may read the shop's usage (Slice 11.6).
 */
export function ApiKeysView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const { viewer } = useShell();
  const keys = useApiKeys();
  const usage = useUsage({ enabled: allows(viewer, [Permission.PaymentsRead]) });
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const requests = usage.data?.metrics.find((each) => each.metric === UsageMetric.Requests);

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
      {keys.isError ? <Banner tone="bad">{errorText(keys.error)}</Banner> : null}
      {keys.data ? (
        <Card flush>
          {keys.data.length === 0 ? (
            <EmptyState icon="key">{t('akEmpty')}</EmptyState>
          ) : (
            <RowList>
              {keys.data.map((key) => {
                const revoked = key.revokedAt !== null;
                const body = (
                  <>
                    <span className="flex size-10 flex-none items-center justify-center rounded-[8px] bg-neutral-100 text-fg-muted">
                      <Icon name="key" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="min-w-0 overflow-hidden text-[16px] font-medium text-ellipsis whitespace-nowrap">
                        {key.name}
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
      <Card>
        {requests ? (
          <p className="text-[15px] text-fg-muted">
            {t('akLimit', {
              requests:
                requests.limit === null
                  ? requests.used.toLocaleString('en-US')
                  : `${requests.used.toLocaleString('en-US')} / ${requests.limit.toLocaleString('en-US')}`,
            })}
          </p>
        ) : null}
        <p className={`text-[14px] text-fg-muted ${requests ? 'mt-1.5' : ''}`}>{t('akRotate')}</p>
      </Card>

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
