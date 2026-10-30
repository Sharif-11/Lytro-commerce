import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { PRODUCT_SLUG_MAX_LENGTH } from '@lytronix/validators';
import { useChangeSlug } from '@/api/products';
import { LinkShare } from '@/components/link-share';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, SelectField } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { useShopAddress } from '@/hooks/use-shop-address';
import { useShell } from '@/shell/shell-context';
import type { ProductDetail } from '@/types/product';

/** LND-06: a product's landing link, and the same with a variant chosen, by the variant's id as the feed's links are. */
function linkOf(host: string, product: ProductDetail, variantId: string | null): string {
  return `${host}/l/${product.slug}${variantId ? `?v=${variantId}` : ''}`;
}

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
 * Facebook and WhatsApp, and the line that opens its sheet -- a variant for the link, and changing it.
 */
export function LinkCard({
  product,
  readOnly,
}: {
  product: ProductDetail;
  readOnly: boolean;
}): React.JSX.Element {
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
          several || !readOnly ? (
            <button
              type="button"
              className="text-left font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => {
                setOpen(true);
              }}
            >
              {several ? t('linkPick') : t('linkChange')}
            </button>
          ) : null
        }
      />
      <LinkSheet
        open={open}
        product={product}
        host={host}
        readOnly={readOnly}
        onClose={() => {
          setOpen(false);
        }}
      />
    </Card>
  );
}

/**
 * The product link's sheet (the prototype's `sh-link`): the link with Copy and sharing, a variant to open it with
 * (`?v=`), and Change the link, the old one redirecting (LND-04).
 */
function LinkSheet({
  open,
  product,
  host,
  readOnly,
  onClose,
}: {
  open: boolean;
  product: ProductDetail;
  host: string;
  readOnly: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const { showToast } = useShell();
  const change = useChangeSlug(product.id);
  const [variantId, setVariantId] = useState('');
  const [typed, setTyped] = useState(product.slug);
  const live = product.variants.filter((variant) => variant.active);
  const shown = linkOf(host, product, variantId || null);
  const problems = change.error instanceof ApiClientError ? change.error.fieldProblems() : {};
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
        {readOnly ? null : (
          <details>
            <summary className="cursor-pointer font-semibold text-primary">
              {t('linkChange')}
            </summary>
            <div className="mt-2.5 flex flex-col gap-3">
              <Field
                label={t('linkName')}
                prefix="/l/"
                value={typed}
                maxLength={PRODUCT_SLUG_MAX_LENGTH}
                help={t('linkChangeNote')}
                error={problems.slug}
                onChange={(event) => {
                  setTyped(event.target.value.trim().toLowerCase());
                }}
              />
              <div>
                <Button
                  tone="outline"
                  size="sm"
                  busy={change.isPending}
                  disabled={typed === '' || typed === product.slug}
                  onClick={() => {
                    change.mutate(typed, {
                      onSuccess: () => {
                        showToast(t('linkChanged'));
                      },
                    });
                  }}
                >
                  {t('linkChange')}
                </Button>
              </div>
              {change.isError && !problems.slug ? (
                <p className="text-[14px] font-medium text-danger-text">
                  {errorText(change.error)}
                </p>
              ) : null}
            </div>
          </details>
        )}
      </div>
    </Sheet>
  );
}
