import { AttributeDataType } from '@lytronix/validators';
import type { IconName } from '@/components/icon';

/** The square at the start of an attribute's row, by its type (the prototype's `ATTRS` rows). */
export const ATTRIBUTE_ICONS: Record<AttributeDataType, IconName> = {
  [AttributeDataType.EnumSingle]: 'layers',
  [AttributeDataType.EnumMulti]: 'layers',
  [AttributeDataType.NumberWithUnit]: 'percent',
  [AttributeDataType.Text]: 'file',
  [AttributeDataType.Boolean]: 'check',
};
