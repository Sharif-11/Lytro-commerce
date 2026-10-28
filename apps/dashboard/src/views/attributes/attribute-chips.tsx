import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ChipCount, ChipRow } from '@/components/ui/chips';
import { chipClass } from '@/components/ui/classes';

/** Attributes and Option sets, the two halves of the Attributes section, each with its count (Part 19's `attributes`). */
export function AttributeChips({
  slug,
  current,
  attributes,
  sets,
}: {
  slug: string;
  current: 'attributes' | 'sets';
  attributes: number | undefined;
  sets: number | undefined;
}): React.JSX.Element {
  const { t } = useTranslation('shell');
  const chip = (on: boolean, label: string, count: number | undefined) => (
    <>
      {label}
      {count === undefined ? null : <ChipCount on={on}>{count}</ChipCount>}
    </>
  );
  return (
    <ChipRow>
      <Link
        to="/$shop/attributes"
        params={{ shop: slug }}
        className={chipClass(current === 'attributes')}
      >
        {chip(current === 'attributes', t('secAttributes'), attributes)}
      </Link>
      <Link
        to="/$shop/attributes/option-sets"
        params={{ shop: slug }}
        className={chipClass(current === 'sets')}
      >
        {chip(current === 'sets', t('optionSets'), sets)}
      </Link>
    </ChipRow>
  );
}
