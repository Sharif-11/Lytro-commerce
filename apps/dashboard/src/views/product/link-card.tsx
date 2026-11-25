import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LinkShare } from '@/components/link-share';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SelectField } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useShopAddress } from '@/hooks/use-shop-address';
import { linkOf } from '@/lib/product-link';
import type { ProductDetail } from '@/types/product';

/** A variant by the options that name it ("M · Black"). */
function variantName(product: ProductDetail, optionIds: readonly string[]): string {
  const values = new Map(
    product.variantAttributes.flatMap((attribute) =>
      attribute.options.map((option) => [option.id, option.value] as const),
    ),
  );
  return optionIds
    .map((id) => values.get(id) ?? '')
    .filter(Boolean)
    .join(' · ');
}

/**
 * The product link (TENANT-DASHBOARD-DESIGN §7.4, the prototype's link card; LND-04, LND-06): the address with Copy,
 * Facebook and WhatsApp, and, for a product of several variants, the line that opens its sheet to pick one for the
 * link. The owner, 2026-11-25: the link names the product by its ID, so "Change the link" (its slug) is gone from here;
 * the server still makes and keeps slugs, and an old slug link still opens.
 */
export function LinkCard({ product }: { product: ProductDetail }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const { host } = useShopAddress();
  const [open, setOpen] = useState(false);
  const several = product.variants.filter((variant) => variant.active).length > 1;
  const shown = linkOf(host, product, null);
  return (
    <Card>
      <h3 className="text-[17px] font-semibold">{t('productLink')}</h3>
      <LinkShare
        url={`https://${shown}`}
        shown={shown}
        note={
          several ? (
            <button
              type="button"
              className="text-left font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => {
                setOpen(true);
              }}
            >
              {t('linkPick')}
            </button>
          ) : null
        }
      />
      <LinkSheet
        open={open}
        product={product}
        host={host}
        onClose={() => {
          setOpen(false);
        }}
      />
    </Card>
  );
}

/**
 * The product link's sheet (the prototype's `sh-link`): the link with Copy and sharing, and a variant to open it with
 * (`?v=`).
 */
function LinkSheet({
  open,
  product,
  host,
  onClose,
}: {
  open: boolean;
  product: ProductDetail;
  host: string;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const [variantId, setVariantId] = useState('');
  const live = product.variants.filter((variant) => variant.active);
  const shown = linkOf(host, product, variantId || null);
  return (
    <Sheet
      open={open}
      title={t('linkTitle')}
      onClose={onClose}
      footer={
        <Button wide onClick={onClose}>
          {t('done')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <span className="text-[14px] font-medium text-fg-muted">{t('productLink')}</span>
          <LinkShare url={`https://${shown}`} shown={shown} />
        </div>
        {live.length > 1 ? (
          <SelectField
            label={t('linkVariant')}
            value={variantId}
            options={[
              { value: '', label: t('linkNoVariant') },
              ...live.map((variant) => ({
                value: variant.id,
                label: variantName(product, variant.optionIds),
              })),
            ]}
            onChange={(event) => {
              setVariantId(event.target.value);
            }}
          />
        ) : null}
      </div>
    </Sheet>
  );
}
