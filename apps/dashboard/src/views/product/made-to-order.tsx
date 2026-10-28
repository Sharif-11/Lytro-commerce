import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StockTracking } from '@lytronix/validators';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import type { ProductStock } from '@/types/attribute';
import type { ProductDetail } from '@/types/product';

/** INV-01: everything a product holds, its variants' own stock and any it shares; nothing known without the read. */
function heldOf(stock: ProductStock | undefined): number {
  if (!stock) return 0;
  return (
    stock.variants.reduce((sum, each) => sum + Number(each.onHand ?? 0), 0) +
    Number(stock.shared?.onHand ?? 0)
  );
}

/**
 * INV-02 (Part 15's `sh-made-to-order`): making a saved product that holds stock to order writes that stock off, so it
 * asks first, naming how much and that counting again starts at 0. Answers what the tracking choices call, and the
 * question to render.
 */
export function useTrackingChoice({
  name,
  product,
  stock,
  onTracking,
}: {
  name: string;
  product: ProductDetail | null;
  stock: ProductStock | undefined;
  onTracking: (tracking: StockTracking) => void;
}): { choose: (tracking: StockTracking) => void; question: React.JSX.Element } {
  const { t } = useTranslation('shop');
  const [asking, setAsking] = useState<number | null>(null);

  function choose(tracking: StockTracking): void {
    const held =
      tracking === StockTracking.NotTracked && product?.stockTracking === StockTracking.Tracked
        ? heldOf(stock)
        : 0;
    if (held > 0) setAsking(held);
    else onTracking(tracking);
  }

  const question = (
    <Dialog
      open={asking !== null}
      title={t('mtoTitle')}
      onClose={() => {
        setAsking(null);
      }}
      actions={
        <>
          <Button
            tone="outline"
            onClick={() => {
              setAsking(null);
            }}
          >
            {t('keepCounting')}
          </Button>
          <Button
            tone="danger"
            onClick={() => {
              setAsking(null);
              onTracking(StockTracking.NotTracked);
            }}
          >
            {t('makeMto')}
          </Button>
        </>
      }
    >
      {asking === null ? null : t('mtoText', { name, count: asking })}
    </Dialog>
  );
  return { choose, question };
}
