import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { Permission } from '@lytronix/validators';
import { useProductRoom } from '@/api/catalogue';
import { useRemoveProduct, useRestoreProduct } from '@/api/products';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import { formOf } from '@/lib/product-form';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { ProductDetail } from '@/types/product';
import { ProductLimitBanner } from '@/views/products/product-limit-banner';
import { unusedMedia } from '@/api/media';
import { BasicsCard } from './basics-card';
import { PhotoStrip } from './photo-strip';
import { itemsOf } from './product-media';
import { RemoveDialog } from './remove-dialog';

/**
 * An archived product's page (Part 13's `product-archived`; PRD-13, agreed 2026-10-27): it says so, with Restore and
 * Delete for good, and shows its fields as they were, nothing to change until it is back. Restoring at the limit shows
 * the limit's banner, as Add product does.
 */
export function ArchivedProduct({ product }: { product: ProductDetail }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug, viewer, showToast } = useShell();
  const mayManage = allows(viewer, [Permission.ProductsManage]);
  const room = useProductRoom();
  const restore = useRestoreProduct(product.id);
  const remove = useRemoveProduct(product.id);
  const [full, setFull] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const toList = (): void => {
    void navigate({ to: '/$shop/products', params: { shop: slug } });
  };

  return (
    <ShellPage
      title={product.name}
      actions={<StatusTag tone="neutral">{t('plArchived')}</StatusTag>}
    >
      {full && room.data ? <ProductLimitBanner room={room.data} lead="now" /> : null}
      <Banner tone="warn">{t('peArchived')}</Banner>
      {restore.isError && !full ? <Banner tone="bad">{errorText(restore.error)}</Banner> : null}
      {mayManage ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            busy={restore.isPending}
            onClick={() => {
              if (room.data?.full) {
                setFull(true);
                return;
              }
              restore.mutate(undefined, {
                onSuccess: () => {
                  showToast(t('peRestored', { name: product.name }));
                  toList();
                },
                onError: (error) => {
                  if (error instanceof ApiClientError && error.code === 'plan_limit_reached') {
                    setFull(true);
                  }
                },
              });
            }}
          >
            {t('peRestore')}
          </Button>
          <Button
            tone="outline"
            size="sm"
            onClick={() => {
              setDeleting(true);
            }}
          >
            <span className="text-danger-text">{t('deleteForever')}</span>
          </Button>
        </div>
      ) : null}
      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-columns">
        <BasicsCard
          picking={false}
          onPicking={() => undefined}
          form={formOf(product)}
          strip={
            <PhotoStrip
              photos={product.images.flatMap((image) => {
                const item = itemsOf(product).get(image.id);
                return item ? [item] : [];
              })}
              video={product.video ? (itemsOf(product).get(product.video.id) ?? null) : null}
              uploads={[]}
              storage={undefined}
              readOnly
              onAddPhotos={() => undefined}
              onAddVideo={() => undefined}
              onDismiss={() => undefined}
            />
          }
          problems={{}}
          readOnly
          onChange={() => undefined}
        />
      </div>
      <RemoveDialog
        open={deleting ? 'hard' : null}
        only="hard"
        busy={remove.isPending}
        error={remove.isError ? errorText(remove.error) : null}
        onClose={() => {
          setDeleting(false);
        }}
        onRemove={() => {
          remove.mutate(true, {
            onSuccess: () => {
              // PRD-11, agreed 2026-10-27: its photos and video go too, unless something else shows them.
              void unusedMedia.forget([
                ...product.images.map((image) => image.id),
                ...(product.video ? [product.video.id] : []),
              ]);
              showToast(t('peDeletedToast', { name: product.name }));
              toList();
            },
          });
        }}
      />
    </ShellPage>
  );
}
