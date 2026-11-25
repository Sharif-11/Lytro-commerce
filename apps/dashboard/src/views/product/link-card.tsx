import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { PRODUCT_SLUG_MAX_LENGTH } from '@lytronix/validators';
import { useChangeSlug } from '@/api/products';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { useShopAddress } from '@/hooks/use-shop-address';
import { linkOf } from '@/lib/product-link';
import { useShell } from '@/shell/shell-context';
import type { ProductDetail } from '@/types/product';

/**
 * Change the link (LND-04), in the editor's more settings: the link card and its sheet's variant link moved to the
 * product's page and its share sheet (TENANT-DASHBOARD-DESIGN §7.4c, the owner 2026-11-25), and this button stays.
 */
export function LinkChangeButton({
  product,
  readOnly,
}: {
  product: ProductDetail;
  readOnly: boolean;
}): React.JSX.Element | null {
  const { t } = useTranslation('shop');
  const [open, setOpen] = useState(false);
  if (readOnly) return null;
  return (
    <>
      <Button
        tone="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('linkChange')}
      </Button>
      <LinkSheet
        open={open}
        product={product}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}

/** The link's sheet (the prototype's `sh-link`): the link as it is, and a new name for it, the old one redirecting. */
function LinkSheet({
  open,
  product,
  onClose,
}: {
  open: boolean;
  product: ProductDetail;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const { host } = useShopAddress();
  const { showToast } = useShell();
  const change = useChangeSlug(product.id);
  const [typed, setTyped] = useState(product.slug);
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
        <p className="text-[16px] break-all" data-testid="link-now">
          {linkOf(host, product, null)}
        </p>
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
          <p className="text-[14px] font-medium text-danger-text">{errorText(change.error)}</p>
        ) : null}
      </div>
    </Sheet>
  );
}
