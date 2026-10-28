import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { useSuppliers, useUpdateSupplier } from '@/api/purchases';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { chipClass } from '@/components/ui/classes';
import { Chip, ChipRow } from '@/components/ui/chips';
import { EmptyState } from '@/components/ui/empty-state';
import { RowChevron, RowLead, RowList, RowText, rowClass } from '@/components/ui/list-row';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import { formatDayMonth } from '@/lib/dates';
import { bangladeshiPhone } from '@/lib/phone';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { Supplier } from '@/types/purchasing';
import { SupplierSheet } from './supplier-sheet';

/**
 * Suppliers (TENANT-DASHBOARD-DESIGN §7.21, the prototype's `suppliers` and Part 21; PUR-01): each live supplier with
 * its phone and last purchase, its sheet for someone who may change stock; Show archived lists the archived ones, each
 * with Bring back. A supplier is never deleted.
 */
export function SuppliersView({ archived }: { archived: boolean }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug, viewer } = useShell();
  const mayManage = allows(viewer, [Permission.InventoryManage]);
  const list = useSuppliers({ archived });
  const archivedCount = useSuppliers({ archived: true });
  const bringBack = useUpdateSupplier();
  // Undefined while closed; null for a new supplier.
  const [open, setOpen] = useState<Supplier | null | undefined>(undefined);
  const suppliers = list.data?.suppliers ?? [];
  const hidden = archivedCount.data?.total ?? 0;

  const show = (next: boolean) => {
    void navigate({
      to: '/$shop/purchases/suppliers',
      params: { shop: slug },
      search: { archived: next ? 1 : undefined },
      replace: true,
    });
  };

  const newSupplier = (withIcon: boolean) =>
    mayManage ? (
      <Button
        size="sm"
        onClick={() => {
          setOpen(null);
        }}
      >
        {withIcon ? <Icon name="plus" /> : null}
        {t('supNew')}
      </Button>
    ) : null;

  const line = (supplier: Supplier) =>
    [
      supplier.phone ? bangladeshiPhone.display(supplier.phone) : t('supNoPhone'),
      supplier.lastPurchaseAt
        ? t('supLast', { date: formatDayMonth(supplier.lastPurchaseAt) })
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <ShellPage actions={newSupplier(true)}>
      <ChipRow role="group">
        <Link to="/$shop/purchases" params={{ shop: slug }} className={chipClass(false)}>
          {t('poOpen')}
        </Link>
        <Chip
          on={!archived}
          onClick={() => {
            show(false);
          }}
        >
          {t('suppliers')}
        </Chip>
        {archived || hidden > 0 ? (
          <Chip
            on={archived}
            count={hidden}
            onClick={() => {
              show(true);
            }}
          >
            {t('supShowArchived')}
          </Chip>
        ) : null}
      </ChipRow>
      {list.isError ? <Banner tone="bad">{errorText(list.error)}</Banner> : null}
      {bringBack.isError ? <Banner tone="bad">{errorText(bringBack.error)}</Banner> : null}
      {list.isPending ? (
        <Card flush>
          <SkeletonRows count={3} />
        </Card>
      ) : suppliers.length === 0 && list.isSuccess ? (
        <Card>
          {archived ? (
            <EmptyState icon="users">{t('supArchivedNone')}</EmptyState>
          ) : (
            <EmptyState icon="users" action={newSupplier(false) ?? undefined}>
              {t('supNone')}
            </EmptyState>
          )}
        </Card>
      ) : (
        <Card flush>
          <RowList>
            {suppliers.map((supplier) => {
              const lead = <RowLead>{supplier.name.slice(0, 1)}</RowLead>;
              if (archived) {
                return (
                  <div key={supplier.id} className={rowClass}>
                    {lead}
                    <RowText
                      title={
                        <>
                          {supplier.name}{' '}
                          <StatusTag tone="neutral" small>
                            {t('supArchived')}
                          </StatusTag>
                        </>
                      }
                      sub={<span className="num">{line(supplier)}</span>}
                    />
                    {mayManage ? (
                      <Button
                        tone="outline"
                        size="xs"
                        busy={bringBack.isPending && bringBack.variables.id === supplier.id}
                        onClick={() => {
                          bringBack.mutate({ id: supplier.id, body: { archived: false } });
                        }}
                      >
                        {t('supBringBack')}
                      </Button>
                    ) : null}
                  </div>
                );
              }
              const body = (
                <>
                  {lead}
                  <RowText
                    title={supplier.name}
                    sub={<span className="num">{line(supplier)}</span>}
                  />
                </>
              );
              return mayManage ? (
                <button
                  key={supplier.id}
                  type="button"
                  className={rowClass}
                  onClick={() => {
                    setOpen(supplier);
                  }}
                >
                  {body}
                  <RowChevron />
                </button>
              ) : (
                <div key={supplier.id} className={rowClass}>
                  {body}
                </div>
              );
            })}
          </RowList>
        </Card>
      )}
      {archived && suppliers.length > 0 ? (
        <p className="text-[14px] text-fg-muted">{t('supArchivedHint')}</p>
      ) : null}
      <SupplierSheet
        open={open !== undefined}
        supplier={open ?? null}
        onClose={() => {
          setOpen(undefined);
        }}
      />
    </ShellPage>
  );
}
