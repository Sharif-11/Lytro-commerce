import { useTranslation } from 'react-i18next';
import { AttributeDataType, type UnitKind } from '@lytronix/validators';
import { measureOf } from '@/lib/measure';
import type { SplitAttribute } from '@/lib/variant-matrix';

type Splits = readonly Pick<SplitAttribute, 'dataType' | 'unitKind' | 'options'>[];

/** How options, variants and attribute types read in the editor, in the shop's words. */
export function useVariantWords() {
  const { t } = useTranslation('shop');

  /** UOM-02: a number-with-unit value as it reads ("5 kg"); any other value as it was written. */
  const measure = (value: string, unitKind: UnitKind | null): string => {
    const { amount, unit } = measureOf(value, unitKind);
    return unit ? `${amount} ${t(`unit_${unit}`)}` : amount;
  };

  /** An option as a chip or a row names it. */
  const option = (
    each: { value: string },
    split: Pick<SplitAttribute, 'dataType' | 'unitKind'>,
  ): string =>
    split.dataType === AttributeDataType.NumberWithUnit
      ? measure(each.value, split.unitKind)
      : each.value;

  /**
   * A variant by its options, one of each splitting attribute, in the splits' order ("M · Black"). Each split's option is
   * found among the ids by itself: a read may list them in another order (the stock reads list them by attribute).
   */
  const variant = (optionIds: readonly string[], splits: Splits): string =>
    splits
      .map((split) => {
        const found = split.options.find((each) => optionIds.includes(each.id));
        return found ? option(found, split) : '';
      })
      .join(' · ');

  /** ATL-01: an attribute's type in a word, as Add attribute's rows and the value sheets say it. */
  const type = (dataType: AttributeDataType): string => {
    switch (dataType) {
      case AttributeDataType.EnumSingle:
        return t('typeOptions');
      case AttributeDataType.EnumMulti:
        return t('typeMany');
      case AttributeDataType.NumberWithUnit:
        return t('typeNumber');
      case AttributeDataType.Text:
        return t('typeText');
      case AttributeDataType.Boolean:
        return t('typeBool');
    }
  };

  return { measure, option, variant, type };
}
