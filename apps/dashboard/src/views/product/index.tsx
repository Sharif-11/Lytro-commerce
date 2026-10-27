import { useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { Permission } from '@lytronix/validators';
import { useProductRoom } from '@/api/catalogue';
import {
  useCreateProduct,
  useDuplicateProduct,
  useProduct,
  useRemoveProduct,
  useSaveProduct,
} from '@/api/products';
import { ActionBar } from '@/components/ui/action-bar';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useErrorText } from '@/hooks/use-error-text';
import {
  changedParts,
  createBody,
  formOf,
  isDirty,
  NEW_PRODUCT,
  problemsOf,
  withSaved,
  type ProductForm,
} from '@/lib/product-form';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { ProductDetail } from '@/types/product';
import { ProductLimitBanner } from '@/views/products/product-limit-banner';
import { StockTag } from '@/views/products/product-row';
import { ArchivedProduct } from './archived-product';
import { BasicsCard } from './basics-card';
import { LinkCard } from './link-card';
import { MoreSettings } from './more-settings';
import { RemoveDialog } from './remove-dialog';

/**
 * The product editor (TENANT-DASHBOARD-DESIGN §7.4, the prototype's `product` and Part 13's states), Slice 11.7a's
 * part of it: Basics, More settings with Duplicate, Archive and Delete, the product link, one Save, and the question
 * before leaving with something unsaved. An archived product opens its own page with Restore.
 */
export function ProductEditor({ productId }: { productId: string | null }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const product = useProduct(productId);
  if (productId !== null && product.isPending) {
    return (
      <ShellPage>
        <Card flush>
          <SkeletonRows count={4} />
        </Card>
      </ShellPage>
    );
  }
  if (productId !== null && product.isError) {
    const missing = product.error instanceof ApiClientError && product.error.code === 'not_found';
    return (
      <ShellPage>
        {missing ? (
          <Card>
            <EmptyState icon="tag">{t('notFound')}</EmptyState>
          </Card>
        ) : (
          <Banner tone="bad">{errorText(product.error)}</Banner>
        )}
      </ShellPage>
    );
  }
  if (product.data?.archived) return <ArchivedProduct product={product.data} />;
  return <ProductPage key={product.data?.id ?? 'new'} product={product.data ?? null} />;
}

/** The ways an edit can stop short: the shop at its limit, or a part the server refused (Part 13). */
type Stop =
  | { kind: 'limit'; refused: boolean }
  | { kind: 'parts'; parts: { part: string; message: string }[] };

function ProductPage({ product }: { product: ProductDetail | null }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug, viewer, showToast } = useShell();
  const mayManage = allows(viewer, [Permission.ProductsManage]);
  const [saved, setSaved] = useState<ProductForm>(product ? formOf(product) : NEW_PRODUCT);
  const [form, setForm] = useState<ProductForm>(saved);
  const [tried, setTried] = useState(false);
  const [serverProblems, setServerProblems] = useState<Record<string, string>>({});
  const [stop, setStop] = useState<Stop | null>(null);
  const [removing, setRemoving] = useState<'archive' | 'hard' | null>(null);
  const room = useProductRoom();
  const create = useCreateProduct();
  const save = useSaveProduct(product?.id ?? '');
  const duplicate = useDuplicateProduct(product?.id ?? '');
  const remove = useRemoveProduct(product?.id ?? '');
  // Set once the page itself leaves (after a save, a copy or a removal), so nothing asks first.
  const leaving = useRef(false);

  const dirty = isDirty(saved, form);
  const blocker = useBlocker({
    shouldBlockFn: () => !leaving.current && dirty,
    enableBeforeUnload: () => !leaving.current && dirty,
    withResolver: true,
  });

  // PRD-04 (agreed 2026-10-27): a new product at the limit is said on the list, before anything is typed.
  useEffect(() => {
    if (product === null && room.data?.full) {
      leaving.current = true;
      void navigate({
        to: '/$shop/products',
        params: { shop: slug },
        search: { limit: true },
        replace: true,
      });
    }
  }, [product, room.data?.full, navigate, slug]);

  const own = problemsOf(form);
  const problems: Record<string, string | undefined> = {
    name: tried && own.name ? t('errName') : serverProblems.name,
    price:
      tried && own.price
        ? t(own.price === 'required' ? 'errPrice' : 'errNotAPrice')
        : serverProblems.basePrice,
    description: serverProblems.description,
    category: serverProblems.categoryIds ?? serverProblems.primaryCategoryId,
  };
  const count = Object.values(problems).filter(Boolean).length;

  function update(patch: Partial<ProductForm>): void {
    setForm((current) => ({ ...current, ...patch }));
    setServerProblems({});
  }

  function leaveTo(to: '/$shop/products' | '/$shop/products/$productId', productId?: string): void {
    leaving.current = true;
    if (to === '/$shop/products') void navigate({ to, params: { shop: slug } });
    else void navigate({ to, params: { shop: slug, productId: productId ?? '' } });
  }

  const savedWords = (done: ProductDetail): string =>
    done.active ? t('savedLive', { name: done.name }) : t('saved');

  function submit(): void {
    setTried(true);
    setStop(null);
    if (own.name || own.price) return;
    if (product === null) {
      create.mutate(createBody(form), {
        onSuccess: (made) => {
          showToast(savedWords(made));
          leaveTo('/$shop/products');
        },
        onError: (error) => {
          if (error instanceof ApiClientError && error.code === 'plan_limit_reached') {
            setStop({ kind: 'limit', refused: true });
          } else if (error instanceof ApiClientError) setServerProblems(error.fieldProblems());
        },
      });
      return;
    }
    const parts = changedParts(saved, form);
    if (parts.length === 0) return;
    save.mutate(parts, {
      onSuccess: (outcome) => {
        const refused = new Set(outcome.refused.map((each) => each.part));
        setSaved(
          withSaved(
            saved,
            form,
            parts.map((each) => each.part).filter((part) => !refused.has(part)),
          ),
        );
        const fields = outcome.refused.find((each) => each.part === 'fields');
        if (fields?.error instanceof ApiClientError)
          setServerProblems(fields.error.fieldProblems());
        const named = outcome.refused.filter(
          (each) =>
            !(
              each.part === 'fields' &&
              each.error instanceof ApiClientError &&
              Object.keys(each.error.fieldProblems()).length > 0
            ),
        );
        if (named.length > 0) {
          setStop({
            kind: 'parts',
            parts: named.map((each) => ({ part: each.part, message: errorText(each.error) })),
          });
        } else if (outcome.refused.length === 0 && outcome.product) {
          showToast(savedWords(outcome.product));
        }
      },
    });
  }

  function copy(): void {
    if (room.data?.full) {
      setStop({ kind: 'limit', refused: false });
      return;
    }
    duplicate.mutate(undefined, {
      onSuccess: (made) => {
        showToast(t('peCopied'));
        leaveTo('/$shop/products/$productId', made.id);
      },
      onError: (error) => {
        if (error instanceof ApiClientError && error.code === 'plan_limit_reached') {
          setStop({ kind: 'limit', refused: false });
        }
      },
    });
  }

  const busy = create.isPending || save.isPending;
  const title = product ? product.name : t('newProduct');
  return (
    <ShellPage
      title={title}
      actions={product ? <StockTag state={product.stockState} /> : undefined}
    >
      {stop?.kind === 'limit' && room.data ? (
        <ProductLimitBanner room={room.data} lead={stop.refused ? 'refused' : 'now'} />
      ) : null}
      {stop?.kind === 'parts'
        ? stop.parts.map((each) => (
            <Banner key={each.part} tone="bad">
              <b>{t(PART_WORDS[each.part] ?? 'partFields')}</b> {each.message} {t('partRest')}
            </Banner>
          ))
        : null}
      {count > 0 ? (
        <Banner tone="bad">{count === 1 ? t('fixOne') : t('fixMany', { n: count })}</Banner>
      ) : null}
      {create.isError && !(create.error instanceof ApiClientError) ? (
        <Banner tone="bad">{errorText(create.error)}</Banner>
      ) : null}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <BasicsCard
            form={form}
            product={product}
            problems={problems}
            readOnly={!mayManage}
            onChange={update}
          />
          {product ? (
            <MoreSettings
              active={form.active}
              readOnly={!mayManage}
              busy={duplicate.isPending}
              onActive={(active) => {
                update({ active });
              }}
              onDuplicate={copy}
              onRemove={setRemoving}
            />
          ) : null}
        </div>
        {product ? (
          <div className="flex flex-col gap-4">
            <LinkCard product={product} readOnly={!mayManage} />
          </div>
        ) : null}
      </div>
      {mayManage ? (
        <ActionBar>
          <Button busy={busy} onClick={submit}>
            {count > 0 ? (count === 1 ? t('fixOne') : t('fixMany', { n: count })) : t('save')}
          </Button>
        </ActionBar>
      ) : null}
      {product ? (
        <RemoveDialog
          open={removing}
          busy={remove.isPending}
          onClose={() => {
            setRemoving(null);
          }}
          onRemove={(hard) => {
            remove.mutate(hard, {
              onSuccess: () => {
                setRemoving(null);
                showToast(t(hard ? 'peDeletedToast' : 'peArchivedToast', { name: product.name }));
                leaveTo('/$shop/products');
              },
            });
          }}
          error={remove.isError ? errorText(remove.error) : null}
        />
      ) : null}
      <Dialog
        open={blocker.status === 'blocked'}
        title={t('lvTitle')}
        onClose={() => {
          if (blocker.status === 'blocked') blocker.reset();
        }}
        actions={
          <>
            <Button
              tone="outline"
              onClick={() => {
                if (blocker.status === 'blocked') blocker.reset();
              }}
            >
              {t('lvStay')}
            </Button>
            <Button
              tone="danger"
              onClick={() => {
                leaving.current = true;
                if (blocker.status === 'blocked') blocker.proceed();
              }}
            >
              {t('lvLeave')}
            </Button>
          </>
        }
      >
        {product ? t('lvEdit', { name: product.name }) : t('lvNew')}
      </Dialog>
    </ShellPage>
  );
}

/** A part the server refused, by name (Part 13's `product-partial`). */
const PART_WORDS: Record<string, string> = {
  fields: 'partFields',
  images: 'partImages',
  video: 'partVideo',
};
