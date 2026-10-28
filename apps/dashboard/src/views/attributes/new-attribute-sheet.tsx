import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AttributeDataType } from '@lytronix/validators';
import { useCreateAttribute, type AttributeDraft } from '@/api/attributes';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { NewAttributeFields } from '../product/new-attribute-fields';

const BLANK: AttributeDraft = { name: '', dataType: AttributeDataType.EnumSingle, unitKind: null };

/**
 * New attribute on the Attributes page (Part 19's `sh-attr-new`, ATR-01): the product editor's step (Part 14), over the
 * page; Create makes it and closes. A name the shop already sees says so.
 */
export function NewAttributeSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const create = useCreateAttribute();
  const [draft, setDraft] = useState<AttributeDraft>(BLANK);

  useEffect(() => {
    if (!open) return;
    setDraft(BLANK);
    create.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Sheet
      open={open}
      title={t('newAttr')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={create.isPending}
          disabled={draft.name.trim() === ''}
          onClick={() => {
            create.mutate(draft, { onSuccess: onClose });
          }}
        >
          {t('create')}
        </Button>
      }
    >
      <NewAttributeFields
        draft={draft}
        placeholder={t('attrNamePh')}
        error={create.isError ? errorText(create.error) : undefined}
        onChange={setDraft}
      />
    </Sheet>
  );
}
