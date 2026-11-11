import { useTranslation } from 'react-i18next';
import { IdentityKind } from '@lytronix/validators';
import { downloadExport, useExports, useRequestExport } from '@/api/exports';
import { useIdentities } from '@/api/identities';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { useDownload } from '@/hooks/use-download';
import { fileSize } from '@/lib/limits';
import type { DataExport } from '@/types/data-export';

/** The newest export, if it is still worth showing: ready and not lapsed, being made, or failed. */
function latestOf(exports: readonly DataExport[], now = Date.now()): DataExport | null {
  const newest = [...exports].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
  if (!newest) return null;
  if (newest.status === 'ready' && (!newest.expiresAt || Date.parse(newest.expiresAt) < now)) {
    return null;
  }
  return newest;
}

/**
 * Renew's export (LIF-16, LIF-18; decided 2026-10-26, one button in three states): "Export your data"; while it is made,
 * "Preparing your export", read again every 30 seconds, with "we'll email you" only when the owner has an email the
 * server can write to; then "Download your export (18 MB) · lasts 24 hours". Settings keeps the full list (11.6).
 */
export function ExportButton(): React.JSX.Element {
  const { t } = useTranslation('money');
  const exports = useExports();
  const request = useRequestExport();
  const saving = useDownload();
  const identities = useIdentities();
  const latest = latestOf(exports.data ?? []);
  const hasEmail = (identities.data?.identities ?? []).some(
    (identity) => identity.kind === IdentityKind.Email,
  );

  let control: React.JSX.Element;
  if (latest?.status === 'pending') {
    control = (
      <Button tone="ghost" wide disabled>
        {t('exportPreparing')}
        {hasEmail ? t('exportMail') : ''}
      </Button>
    );
  } else if (latest?.status === 'ready') {
    const ready = latest;
    control = (
      <Button
        tone="ghost"
        wide
        busy={saving.busy}
        onClick={() => {
          void saving.run(() => downloadExport(ready.id));
        }}
      >
        <Icon name="download" />
        {t('exportReady', { size: fileSize(ready.fileSizeBytes ?? 0) })}
      </Button>
    );
  } else {
    control = (
      <Button
        tone="ghost"
        wide
        busy={request.isPending}
        onClick={() => {
          request.mutate();
        }}
      >
        <Icon name="download" />
        {latest?.status === 'failed' ? t('exportFailed') : t('exportData')}
      </Button>
    );
  }

  return (
    <>
      {control}
      {request.isError || saving.error ? (
        <ErrorBanner error={request.error ?? saving.error} />
      ) : null}
    </>
  );
}
