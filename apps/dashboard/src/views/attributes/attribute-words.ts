import { useTranslation } from 'react-i18next';
import { AttributeDataType } from '@lytronix/validators';
import type { Attribute } from '@/types/attribute';
import { useVariantWords } from '../product/variant-words';

/** Whether an attribute's values are options the shop lists and adds to here: one of them, or several. */
export const takesOptions = (dataType: AttributeDataType): boolean =>
  dataType === AttributeDataType.EnumSingle || dataType === AttributeDataType.EnumMulti;

/** How the Attributes page names an attribute's kind (the prototype's `ATTRS` rows). */
export function useAttributeWords() {
  const { t } = useTranslation('shop');
  const words = useVariantWords();

  /** Its type, a number with what it measures ("Number (kg)"). */
  const type = (attribute: Attribute): string =>
    attribute.dataType === AttributeDataType.NumberWithUnit && attribute.unitKind
      ? t('typeNumberUnit', { unit: t(`unitWord_${attribute.unitKind}`) })
      : words.type(attribute.dataType);

  /** Its type, and how many options it offers now. */
  const kind = (attribute: Attribute): string => {
    const offered = attribute.options.filter((option) => !option.retired).length;
    return takesOptions(attribute.dataType) && offered > 0
      ? `${type(attribute)} · ${t('optionsN', { count: offered })}`
      : type(attribute);
  };

  return { type, kind };
}
