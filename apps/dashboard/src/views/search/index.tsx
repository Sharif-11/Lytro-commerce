import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useProductSearch } from '@/api/catalogue';
import { Card } from '@/components/ui/card';
import { RowList } from '@/components/ui/list-row';
import { Eyebrow } from '@/components/ui/page';
import { SearchField } from '@/components/ui/search-field';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { ProductRow } from '@/views/products/product-row';
import { useCategoryName } from '@/views/products/product-words';

// How long typing rests before the search runs.
const TYPING_REST_MS = 250;

/**
 * TENANT-DASHBOARD-DESIGN §4.4, the prototype's `search-products`: one field and the matches grouped, with the same
 * rows the list uses. Until Phase 4 the only group is Products; orders and customers join it then.
 */
export function Search({ query }: { query: string }): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { slug } = useShell();
  const navigate = useNavigate();
  const [typed, setTyped] = useState(query);
  const results = useProductSearch(query);
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

  const products = results.data?.products ?? [];

  return (
    <ShellPage title={null}>
      <SearchField
        value={typed}
        autoFocus
        onChange={setTyped}
        placeholder={t('searchPh')}
        label={t('search')}
      />
      {query.trim() === '' ? (
        <p className="text-[14px] text-fg-muted">{t('srchStart')}</p>
      ) : (
        <div>
          <Eyebrow>{t('srchProducts')}</Eyebrow>
          <Card flush className="mt-2">
            {results.isPending ? (
              <SkeletonRows count={2} />
            ) : products.length === 0 ? (
              <p className="px-4 py-5 text-[14px] text-fg-muted">
                {t('srchNone', { q: query.trim() })}
              </p>
            ) : (
              <RowList>
                {products.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    category={categoryName(product.primaryCategoryId)}
                  />
                ))}
              </RowList>
            )}
          </Card>
        </div>
      )}
      <p className="text-[14px] text-fg-muted">{t('srchHint')}</p>
    </ShellPage>
  );
}
