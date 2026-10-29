import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { DELIVERY_ZONE_NAME_MAX_LENGTH } from '@lytronix/validators';
import { useRestoreProduct } from '@/api/products';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { RowList } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import { useShell } from '@/shell/shell-context';
import type { ZoneHolder } from '@/types/delivery';

/**
 * A fixed zone's name (Part 22's `sh-zone-rename`): the shop's own, or back to the automatic one built from the home
 * area. Done keeps it on the page until its Save.
 */
export function RenameSheet({
  open,
  name,
  automatic,
  onDone,
  onClose,
}: {
  open: boolean;
  /** The name as the page holds it; null while it follows the home area. */
  name: string | null;
  automatic: string;
  onDone: (name: string | null) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (open) setTyped(name ?? '');
  }, [open, name]);

  return (
    <Sheet
      open={open}
      title={t('zoneRenameT')}
      onClose={onClose}
      footer={
        <Button
          wide
          onClick={() => {
            onDone(typed.trim() === '' ? null : typed.trim());
          }}
        >
          {t('done')}
        </Button>
      }
    >
      <Field
        label={t('zoneName')}
        value={typed}
        placeholder={automatic}
        maxLength={DELIVERY_ZONE_NAME_MAX_LENGTH}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
      />
      <button
        type="button"
        onClick={() => {
          onDone(null);
        }}
        className="flex min-h-11 items-center gap-2 text-left text-[15px] font-medium text-primary"
      >
        <Icon name="undo" />
        {t('zoneAutoName', { name: automatic })}
      </button>
      <p className="text-[14px] text-fg-muted">{t('zoneAutoNote')}</p>
    </Sheet>
  );
}

/** Delete a zone, asked first (Part 22's `sh-zone-delete`): its areas fall to the next zone that covers them. */
export function DeleteZoneSheet({
  zoneName,
  busy,
  error,
  onDelete,
  onClose,
}: {
  /** Null while closed. */
  zoneName: string | null;
  busy: boolean;
  error: unknown;
  onDelete: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  return (
    <Sheet
      open={zoneName !== null}
      title={zoneName ? t('zoneDelT', { zone: zoneName }) : ''}
      onClose={onClose}
      footer={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button tone="danger" busy={busy} onClick={onDelete}>
            {t('zoneDelete')}
          </Button>
        </>
      }
    >
      <p className="text-[15px]">{t('zoneDelCons')}</p>
      {error ? <Banner tone="bad">{errorText(error)}</Banner> : null}
    </Sheet>
  );
}

/** One product holding the zone: open it, or restore it first when archived. */
function HolderRow({ holder }: { holder: ZoneHolder }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const { slug } = useShell();
  const restore = useRestoreProduct(holder.id);
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2">
      <span className="flex min-w-0 flex-1 items-center gap-2 text-[15px] font-medium">
        <span className="truncate">{holder.name}</span>
        {holder.archived && !restore.isSuccess ? (
          <StatusTag tone="neutral" small>
            {t('plArchived')}
          </StatusTag>
        ) : null}
      </span>
      {holder.archived && !restore.isSuccess ? (
        <Button
          tone="outline"
          size="xs"
          busy={restore.isPending}
          onClick={() => {
            restore.mutate();
          }}
        >
          {t('peRestore')}
        </Button>
      ) : (
        <Link
          to="/$shop/products/$productId"
          params={{ shop: slug, productId: holder.id }}
          className="text-[14px] font-medium text-primary no-underline"
        >
          {t('openProduct')}
        </Link>
      )}
    </div>
  );
}

/**
 * A zone still in use (Part 22's `sh-zone-in-use`; DLV-07): the products whose delivery limit names it, an active one
 * to open and change, an archived one to restore first.
 */
export function InUseSheet({
  holders,
  onClose,
}: {
  /** Null while closed. */
  holders: readonly ZoneHolder[] | null;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <Sheet open={holders !== null} title={t('zoneInUseT')} onClose={onClose}>
      {holders ? (
        <>
          <p className="text-[15px]">{t('zoneInUseCons')}</p>
          <div className="flex-none overflow-hidden rounded-card border border-line">
            <RowList>
              {holders.map((holder) => (
                <HolderRow key={holder.id} holder={holder} />
              ))}
            </RowList>
          </div>
        </>
      ) : null}
    </Sheet>
  );
}
