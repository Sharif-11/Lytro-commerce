import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useCustomers } from '@/api/customers';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { RowList } from '@/components/ui/list-row';
import { SearchField } from '@/components/ui/search-field';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useErrorText } from '@/hooks/use-error-text';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { CustomerDetail } from './customer-page';
import { CustomerRow } from './customer-row';

const TYPING_REST_MS = 250;

/**
 * Customers (TENANT-DASHBOARD-DESIGN §7.32, the prototype's `customers`, `customer` and Part 30; CUS-01, CUS-02): who
 * ordered last first, searched by name or any digits of the phone, Show more past a page. On a phone the list or the
 * open customer; from 1024 px the list with the open customer beside it, the first one when none is chosen.
 */
export function CustomersScreen({
  q,
  customerId,
}: {
  q: string;
  customerId: string | null;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug } = useShell();
  const [typed, setTyped] = useState(q);
  const list = useCustomers(q);
  const customers = (list.data?.pages ?? []).flatMap((page) => page.customers);
  const shown = customerId ?? customers[0]?.id ?? null;
  const search = q ? { q } : {};
  // None at all (`c30-customers-empty`): no search box to try, and nothing to open beside it.
  const none = q === '' && list.data?.pages[0]?.total === 0;

  useEffect(() => {
    if (typed === q) return;
    const timer = window.setTimeout(() => {
      void navigate({
        to: customerId ? '/$shop/customers/$customerId' : '/$shop/customers',
        params: customerId ? { shop: slug, customerId } : { shop: slug },
        search: typed ? { q: typed } : {},
        replace: true,
      });
    }, TYPING_REST_MS);
    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  return (
    <ShellPage title={customerId ? null : undefined}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div
          className={`flex min-w-0 flex-col gap-3 lg:w-[400px] lg:flex-none ${customerId ? 'max-lg:hidden' : ''}`}
        >
          <div className="flex items-center gap-2">
            <SearchField
              value={typed}
              onChange={setTyped}
              placeholder={t('custSearch')}
              label={t('custSearch')}
            />
          </div>
          {list.isError ? <Banner tone="bad">{errorText(list.error)}</Banner> : null}
          {none ? (
            <Card>
              <EmptyState icon="users">{t('custEmpty')}</EmptyState>
            </Card>
          ) : (
            <Card flush>
              {list.isPending ? (
                <SkeletonRows count={4} />
              ) : customers.length === 0 ? (
                <p className="flex min-h-16 items-center px-4 text-[14px] text-fg-muted">
                  {t('custNoMatch', { q })}
                </p>
              ) : (
                <RowList>
                  {customers.map((customer) => (
                    <CustomerRow
                      key={customer.id}
                      customer={customer}
                      selected={customer.id === shown}
                      search={search}
                    />
                  ))}
                </RowList>
              )}
            </Card>
          )}
          {list.hasNextPage ? (
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
          ) : null}
        </div>
        <div
          className={`min-w-0 flex-1 flex-col gap-4 lg:gap-6 ${customerId ? 'flex' : 'hidden lg:flex'}`}
        >
          {shown ? <CustomerDetail key={shown} customerId={shown} /> : null}
        </div>
      </div>
    </ShellPage>
  );
}
