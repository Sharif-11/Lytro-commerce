import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { Permission } from '@lytronix/validators';
import { useCustomer } from '@/api/customers';
import { useLocations } from '@/api/delivery';
import { useCustomerOrders } from '@/api/orders';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { EmptyState } from '@/components/ui/empty-state';
import { RowList } from '@/components/ui/list-row';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatRow, StatTile } from '@/components/ui/stat-tile';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import { formatDayMonth } from '@/lib/dates';
import { bangladeshiPhone } from '@/lib/phone';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import type { Customer } from '@/types/customers';
import { OrderRow } from '../orders/order-list';
import { useOrderWords } from '../orders/order-words';
import { DeleteCustomerDialog, PasswordSheet } from './customer-sheets';
import { customerName } from './customer-words';

/** The customer beside the list, or on their own page on a phone (the prototype's `c30Detail`). */
export function CustomerDetail({ customerId }: { customerId: string }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const customer = useCustomer(customerId);
  if (customer.data) return <CustomerBody customer={customer.data} />;
  if (customer.isError) {
    return (customer.error as { status?: number }).status === 404 ? (
      <Card>
        <EmptyState icon="users">{t('custGone')}</EmptyState>
      </Card>
    ) : (
      <Banner tone="bad">{errorText(customer.error)}</Banner>
    );
  }
  return (
    <Card flush>
      <SkeletonRows count={4} />
    </Card>
  );
}

function CustomerBody({ customer }: { customer: Customer }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const { slug, viewer, showToast } = useShell();
  const navigate = useNavigate();
  const words = useOrderWords();
  const locations = useLocations();
  const [sheet, setSheet] = useState<'password' | 'delete' | null>(null);
  const mayManage = allows(viewer, [Permission.CustomersManage]);
  const name = customerName(customer);

  // The last address: the street, then the thana and its district, as an order's card says them.
  const last = customer.lastAddress;
  const zilla = last
    ? locations.data?.zillas.find((each) =>
        each.thanas.some((thana) => thana.id === last.locationId),
      )
    : undefined;
  const thana = zilla?.thanas.find((each) => each.id === last?.locationId);
  const address = last
    ? [last.deliveryAddress, thana && zilla ? `${words.named(thana)}, ${words.named(zilla)}` : null]
        .filter(Boolean)
        .join(' · ')
    : null;

  const copyPhone = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(customer.phone ?? '');
      showToast(t('phoneCopied'));
    } catch {
      // The clipboard is blocked: nothing was copied, and the number is on the screen.
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-0">
          <h1 className="text-[20px] leading-[1.3] font-bold">{name}</h1>
          {customer.phone ? (
            <p className="num mt-0.5 text-[14px] text-fg-muted">
              {bangladeshiPhone.grouped(customer.phone)}
            </p>
          ) : null}
        </div>
        {customer.phone ? (
          <div className="ml-auto flex flex-none items-center gap-2">
            <a href={`tel:${customer.phone}`} className={buttonClass('outline', 'xs')}>
              <Icon name="phone" />
              {t('call')}
            </a>
            <Button
              tone="outline"
              size="xs"
              aria-label={t('copyPhone')}
              onClick={() => {
                void copyPhone();
              }}
            >
              <Icon name="copy" />
            </Button>
          </div>
        ) : null}
      </div>
      <StatRow label={name}>
        <StatTile label={t('customerOrders')} value={customer.orderCount} />
        <StatTile
          label={t('spent')}
          value={formatTaka(customer.totalSpent)}
          note={t('spentOnDelivered')}
        />
        <StatTile label={t('firstOrder')} value={formatDayMonth(customer.firstOrderAt)} />
      </StatRow>
      {address ? (
        <Card>
          <h3 className="mb-1 text-[17px] font-semibold">{t('lastAddress')}</h3>
          <p className="mt-1.5 text-[14px]">{address}</p>
        </Card>
      ) : null}
      {customer.account ? (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[17px] font-semibold">{t('storeAccount')}</h3>
            <StatusTag tone="ok">{t('hasAccount')}</StatusTag>
          </div>
          <p className={`mt-1.5 text-[14px] ${mayManage ? 'mb-3' : ''}`}>
            {t('storeSince', { day: formatDayMonth(customer.account.createdAt) })}
          </p>
          {mayManage ? (
            <Button
              tone="outline"
              size="sm"
              onClick={() => {
                setSheet('password');
              }}
            >
              <Icon name="key" />
              {t('setPassword')}
            </Button>
          ) : null}
        </Card>
      ) : (
        <Card>
          <h3 className="mb-1 text-[17px] font-semibold">{t('storeAccount')}</h3>
          <p className="mt-1.5 text-[14px]">{t('noStoreAccount')}</p>
        </Card>
      )}
      {allows(viewer, [Permission.OrdersRead]) ? <CustomerOrders customer={customer} /> : null}
      {mayManage ? (
        <Card>
          <details>
            <summary className="cursor-pointer font-semibold text-danger-text">
              {t('privacyDelete')}
            </summary>
            <p className="mt-2 mb-3 text-[14px]">{t('privacyNote')}</p>
            <Button
              tone="danger"
              size="sm"
              onClick={() => {
                setSheet('delete');
              }}
            >
              {t('deleteDetails')}
            </Button>
          </details>
        </Card>
      ) : null}
      {sheet === 'password' ? (
        <PasswordSheet
          customer={customer}
          onClose={() => {
            setSheet(null);
          }}
        />
      ) : null}
      {sheet === 'delete' ? (
        <DeleteCustomerDialog
          customer={customer}
          onDeleted={() => {
            showToast(t('customerDeleted'));
            void navigate({ to: '/$shop/customers', params: { shop: slug } });
          }}
          onClose={() => {
            setSheet(null);
          }}
        />
      ) : null}
    </>
  );
}

/** Their orders, newest first (CUS-02), each opening the order. */
function CustomerOrders({ customer }: { customer: Customer }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const list = useCustomerOrders(customer.id);
  const orders = (list.data?.pages ?? []).flatMap((page) => page.orders);
  return (
    <Card flush>
      <div className="px-4 pt-4 pb-1">
        <h3 className="mb-1 text-[17px] font-semibold">{t('customerOrders')}</h3>
      </div>
      {list.isError ? <Banner tone="bad">{errorText(list.error)}</Banner> : null}
      {list.isPending ? (
        <SkeletonRows count={2} />
      ) : (
        <RowList>
          {orders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              selected={false}
              search={{}}
              picking={null}
              wide
            />
          ))}
        </RowList>
      )}
      {list.hasNextPage ? (
        <div className="p-4">
          <Button
            tone="outline"
            wide
            busy={list.isFetchingNextPage}
            onClick={() => {
              void list.fetchNextPage();
            }}
          >
            {t('showMore')}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
