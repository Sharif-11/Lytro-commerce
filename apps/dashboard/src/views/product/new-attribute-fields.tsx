import { useTranslation } from 'react-i18next';
import { ATTRIBUTE_NAME_MAX_LENGTH, AttributeDataType, UnitKind } from '@lytronix/validators';
import type { AttributeDraft } from '@/api/attributes';
import { Chip } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { useVariantWords } from './variant-words';

const TYPES = [
  AttributeDataType.EnumSingle,
  AttributeDataType.EnumMulti,
  AttributeDataType.NumberWithUnit,
  AttributeDataType.Text,
  AttributeDataType.Boolean,
] as const;

const KINDS = [UnitKind.Weight, UnitKind.Volume, UnitKind.Count] as const;

/**
 * New attribute's fields (Part 14's `sh-attribute-new`; ATR-01, UOM-02): its name, the five types with what each does,
 * what a number measures, and that the type cannot change later. The product editor's Add attribute and the Attributes
 * page's New attribute (Part 19) both show them.
 */
export function NewAttributeFields({
  draft,
  placeholder,
  error,
  onChange,
}: {
  draft: AttributeDraft;
  placeholder?: string;
  error?: string;
  onChange: (draft: AttributeDraft) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const words = useVariantWords();
  const helps: Record<AttributeDataType, string> = {
    [AttributeDataType.EnumSingle]: t('helpOne'),
    [AttributeDataType.EnumMulti]: t('helpMany'),
    [AttributeDataType.NumberWithUnit]: t('helpNumber'),
    [AttributeDataType.Text]: t('helpText'),
    [AttributeDataType.Boolean]: t('helpBool'),
  };
  const kinds: Record<UnitKind, string> = {
    [UnitKind.Weight]: t('kindWeight'),
    [UnitKind.Volume]: t('kindVolume'),
    [UnitKind.Count]: t('kindCount'),
  };
  return (
    <div className="flex flex-col gap-3">
      <Field
        label={t('attrName')}
        value={draft.name}
        maxLength={ATTRIBUTE_NAME_MAX_LENGTH}
        placeholder={placeholder}
        error={error}
        onChange={(event) => {
          onChange({ ...draft, name: event.target.value });
        }}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium text-fg-muted">{t('attrType')}</span>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((type) => (
            <Chip
              key={type}
              size="lg"
              on={draft.dataType === type}
              onClick={() => {
                onChange({
                  ...draft,
                  dataType: type,
                  unitKind:
                    type === AttributeDataType.NumberWithUnit
                      ? (draft.unitKind ?? UnitKind.Weight)
                      : null,
                });
              }}
            >
              {words.type(type)}
            </Chip>
          ))}
        </div>
        <p className="text-[13px] text-fg-muted">{helps[draft.dataType]}</p>
      </div>
      {draft.dataType === AttributeDataType.NumberWithUnit ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[14px] font-medium text-fg-muted">{t('measures')}</span>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((kind) => (
              <Chip
                key={kind}
                size="lg"
                on={draft.unitKind === kind}
                onClick={() => {
                  onChange({ ...draft, unitKind: kind });
                }}
              >
                {kinds[kind]}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
      <p className="text-[14px] text-fg-muted">{t('typeLater')}</p>
    </div>
  );
}
