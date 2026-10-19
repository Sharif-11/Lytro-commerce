import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchTenants } from '@/api/tenants';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { EmptyLine, Page, PageHeader } from '@/components/ui/fields';
import { ErrorBanner } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';
import type { TenantSummary } from '@/types/operator';
import { TenantList } from './tenant-list';
import { TenantPanel } from './tenant-panel';

const SEARCH_DEBOUNCE_MS = 300;

/** LIF-24, PLN-11, PLN-17, BAL-12: find a shop, then act on it in one panel: suspend or restore, adjust
    the balance, set a limit override, assign a plan. Container: the search and which tenant is open. */
export function Tenants(): React.JSX.Element {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<TenantSummary | null>(null);
  const tenants = useSearchTenants(query);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setQuery(typed.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(handle);
    };
  }, [typed]);

  const entries = tenants.data?.pages.flatMap((page) => page.entries) ?? [];
  // The open panel follows the list, so a suspend or restore shows its new state at once.
  const current = selected ? (entries.find((entry) => entry.id === selected.id) ?? selected) : null;

  return (
    <Page>
      <PageHeader title={t('tenants.title')} lead={t('tenants.lead')} />
      <TextField
        label={t('tenants.search')}
        name="query"
        type="search"
        placeholder={t('tenants.searchPlaceholder')}
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
      />

      {current ? (
        <TenantPanel
          tenant={current}
          onClose={() => {
            setSelected(null);
          }}
        />
      ) : null}

      {tenants.isLoading ? <EmptyLine>{t('common.loading')}</EmptyLine> : null}
      {tenants.isError ? <ErrorBanner message={errorMessage(tenants.error, t)} /> : null}
      {tenants.data && entries.length === 0 ? <EmptyLine>{t('tenants.empty')}</EmptyLine> : null}
      {entries.length > 0 ? (
        <TenantList tenants={entries} selectedId={current?.id ?? null} onSelect={setSelected} />
      ) : null}
      {tenants.hasNextPage ? (
        <Button
          type="button"
          tone="outline"
          fit
          loading={tenants.isFetchingNextPage}
          onClick={() => {
            void tenants.fetchNextPage();
          }}
        >
          {t('common.loadMore')}
        </Button>
      ) : null}
    </Page>
  );
}
