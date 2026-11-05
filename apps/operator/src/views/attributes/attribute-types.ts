import { AttributeDataType } from '@lytronix/validators';
import type { LibraryAttribute } from '@/types/operator';

/** ATL-01: only an attribute of options has values of its own. */
export function hasValues(attribute: Pick<LibraryAttribute, 'dataType'>): boolean {
  return (
    attribute.dataType === AttributeDataType.EnumSingle ||
    attribute.dataType === AttributeDataType.EnumMulti
  );
}
