import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCreatePlatformWallet,
  useDeletePlatformWallet,
  usePlatformWallets,
  useUpdatePlatformWallet,
} from '@/api/platform-wallets';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Card, EmptyLine, Page, PageHeader } from '@/components/ui/fields';
import { ErrorBanner } from '@/components/ui/notice';
import type { PlatformWallet } from '@/types/operator';
import { WalletForm, type WalletFormValues } from './wallet-form';

type Panel = { mode: 'create' } | { mode: 'edit'; wallet: PlatformWallet } | null;

/** BIL-08: the bKash and Nagad numbers sellers send plan payments and top-ups to, in display order. */
export function Wallets(): React.JSX.Element {
  const { t } = useTranslation();
  const wallets = usePlatformWallets();
  const create = useCreatePlatformWallet();
  const update = useUpdatePlatformWallet();
  const remove = useDeletePlatformWallet();
  const [panel, setPanel] = useState<Panel>(null);
  const [deleting, setDeleting] = useState<PlatformWallet | null>(null);

  function closePanel(): void {
    setPanel(null);
    create.reset();
    update.reset();
  }

  function handleSubmit(values: WalletFormValues): void {
    if (panel?.mode === 'create') {
      create.mutate(values, { onSuccess: closePanel });
    } else if (panel?.mode === 'edit') {
      update.mutate({ id: panel.wallet.id, ...values }, { onSuccess: closePanel });
    }
  }

  const sorted = [...(wallets.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <Page narrow>
      <PageHeader
        title={t('wallets.title')}
        lead={t('wallets.lead')}
        action={
          panel === null ? (
            <Button
              type="button"
              fit
              onClick={() => {
                setPanel({ mode: 'create' });
              }}
            >
              {t('wallets.add')}
            </Button>
          ) : null
        }
      />

      {panel !== null ? (
        <WalletForm
          mode={panel.mode}
          initial={panel.mode === 'edit' ? panel.wallet : undefined}
          pending={create.isPending || update.isPending}
          error={
            create.isError
              ? errorMessage(create.error, t)
              : update.isError
                ? errorMessage(update.error, t)
                : null
          }
          onCancel={closePanel}
          onSubmit={handleSubmit}
        />
      ) : null}

      {wallets.isLoading ? <EmptyLine>{t('common.loading')}</EmptyLine> : null}
      {wallets.isError ? <ErrorBanner message={errorMessage(wallets.error, t)} /> : null}
      {wallets.data && wallets.data.length === 0 ? (
        <EmptyLine>{t('wallets.empty')}</EmptyLine>
      ) : null}
      {sorted.length > 0 ? (
        <Card className="divide-y divide-line !p-0">
          {sorted.map((wallet) => (
            <div key={wallet.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-fg">
                  {wallet.provider}
                  <span className="num font-semibold text-fg-muted">{wallet.number}</span>
                  {!wallet.enabled ? <Tag tone="neutral">{t('wallets.disabled')}</Tag> : null}
                </p>
                <p className="text-[13px] text-fg-muted">
                  {wallet.label ?? t('wallets.noLabel')} ·{' '}
                  {t('wallets.order', { n: wallet.displayOrder })}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  tone="outline"
                  small
                  fit
                  onClick={() => {
                    setPanel({ mode: 'edit', wallet });
                  }}
                >
                  {t('common.edit')}
                </Button>
                <Button
                  type="button"
                  tone="danger"
                  small
                  fit
                  onClick={() => {
                    setDeleting(wallet);
                  }}
                >
                  {t('common.delete')}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title={t('wallets.deleteTitle')}
        message={deleting ? `${deleting.provider} ${deleting.number}` : null}
        error={remove.isError ? errorMessage(remove.error, t) : null}
        confirmLabel={t('common.delete')}
        danger
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
            },
          });
        }}
        onCancel={() => {
          setDeleting(null);
          remove.reset();
        }}
      />
    </Page>
  );
}
