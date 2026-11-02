import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { useProductSearch } from '@/api/catalogue';
import { useCustomerSearch } from '@/api/customers';
import { useOrderSearch } from '@/api/orders';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { RowList } from '@/components/ui/list-row';
import { Eyebrow } from '@/components/ui/page';
import { SearchField } from '@/components/ui/search-field';
import { SkeletonRows } from '@/components/ui/skeleton';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { CustomerRow } from '@/views/customers/customer-row';
import { OrderRow } from '@/views/orders/order-list';
import { ProductRow } from '@/views/products/product-row';
import { useCategoryName } from '@/views/products/product-words';

// How long typing rests before the search runs.
const TYPING_REST_MS = 250;
// How many of each a group shows; See all opens the rest in their own list.
const SHOWN = 2;

/** A group of what was found (the prototype's `s30Page`): its name, See all with the count, its first rows. */
function Group({
  title,
  seeAll,
  children,
}: {
  title: string;
  seeAll: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>{title}</Eyebrow>
        {seeAll ? (
          <span className="inline-flex items-center text-[14px] font-medium whitespace-nowrap text-primary [&_a]:no-underline">
            {seeAll}
          </span>
        ) : null}
      </div>
      <Card flush className="mt-2">
        <RowList>{children}</RowList>
      </Card>
    </div>
  );
}

/**
 * The one search (TENANT-DASHBOARD-DESIGN §7.32, the prototype's `search`, `s30-number` and `s30-none`; agreed
 * 2026-10-31): orders by number, phone or name, customers and products, grouped in that order, each with See all and
 * its count, for whoever may read them. A full order number finds that order alone; nothing found says what to try.
 */
export function Search({ query }: { query: string }): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { slug, viewer } = useShell();
  const navigate = useNavigate();
  const [typed, setTyped] = useState(query);
  const q = query.trim();
  const orders = useOrderSearch(q, SHOWN, { enabled: allows(viewer, [Permission.OrdersRead]) });
  const customers = useCustomerSearch(q, SHOWN, {
    enabled: allows(viewer, [Permission.CustomersRead]),
  });
  const products = useProductSearch(q, { enabled: allows(viewer, [Permission.ProductsRead]) });
  const categoryName = useCategoryName();

  useEffect(() => {
    if (typed === query) return;
    const timer = window.setTimeout(() => {
      void navigate({
        to: '/$shop/search',
        params: { shop: slug },
        search: { q: typed },
        replace: true,
      });
    }, TYPING_REST_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [typed, query, navigate, slug]);

  const orderTotal = orders.data?.total ?? 0;
  const customerTotal = customers.data?.total ?? 0;
  const productTotal = products.data?.total ?? 0;
  const loading = orders.isLoading || customers.isLoading || products.isLoading;
  const found = orderTotal + customerTotal + productTotal > 0;
  const seeAll = (total: number, link: (label: string) => ReactNode) =>
    total > SHOWN ? link(t('srchSeeAll', { count: total })) : null;

  return (
    <ShellPage title={null}>
      <div className="flex items-center gap-2">
        <SearchField
          value={typed}
          autoFocus
          onChange={setTyped}
          placeholder={t('searchPagePh')}
          label={t('search')}
        />
      </div>
      {q === '' ? (
        <p className="text-[14px] text-fg-muted">{t('srchType')}</p>
      ) : loading && !found ? (
        <Card flush>
          <SkeletonRows count={3} />
        </Card>
      ) : !found ? (
        <Card>
          <EmptyState icon="search">
            <b>{t('srchNoneT', { q })}</b>
            <br />
            {t('srchNoneH')}
          </EmptyState>
        </Card>
      ) : (
        <>
          {orderTotal > 0 ? (
            <Group
              title={t('srchOrders')}
              seeAll={seeAll(orderTotal, (label) => (
                <Link to="/$shop/orders" params={{ shop: slug }} search={{ tab: 'all', q }}>
                  {label}
                </Link>
              ))}
            >
              {orders.data?.orders.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  selected={false}
                  search={{}}
                  picking={null}
                  wide
                />
              ))}
            </Group>
          ) : null}
          {customerTotal > 0 ? (
            <Group
              title={t('srchCustomers')}
              seeAll={seeAll(customerTotal, (label) => (
                <Link to="/$shop/customers" params={{ shop: slug }} search={{ q }}>
                  {label}
                </Link>
              ))}
            >
              {customers.data?.customers.map((customer) => (
                <CustomerRow key={customer.id} customer={customer} wide />
              ))}
            </Group>
          ) : null}
          {productTotal > 0 ? (
            <Group
              title={t('srchProducts')}
              seeAll={seeAll(productTotal, (label) => (
                <Link to="/$shop/products" params={{ shop: slug }} search={{ q }}>
                  {label}
                </Link>
              ))}
            >
              {products.data?.products.slice(0, SHOWN).map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  category={categoryName(product.primaryCategoryId)}
                />
              ))}
            </Group>
          ) : null}
        </>
      )}
    </ShellPage>
  );
}
