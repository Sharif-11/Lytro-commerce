import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OPTION_VALUE_MAX_LENGTH, ATTRIBUTE_NAME_MAX_LENGTH } from '@lytronix/validators';
import {
  useAddOptions,
  useUpdateAttribute,
  useUpdateOption,
  type OptionChange,
} from '@/api/attributes';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Eyebrow } from '@/components/ui/page';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import type { Attribute, AttributeOption } from '@/types/attribute';
import type { OptionSwatch } from '@/types/product';
import { SwatchPalette } from '../product/swatch-palette';
import { takesOptions, useAttributeWords } from './attribute-words';
import { ScopeTag } from './scope-tag';

/** One option as its step edits it: its name and its swatch. */
interface OptionDraft extends OptionSwatch {
  value: string;
  /** A picture chosen here, for the server; null keeps the one it has. */
  swatchImageId: string | null;
}

/** What Save sends for an option: only what changed. */
function optionChange(option: AttributeOption, draft: OptionDraft): OptionChange {
  const change: OptionChange = {};
  if (draft.value.trim() !== option.value) change.value = draft.value.trim();
  if (draft.swatchImageId !== null) change.swatchImageId = draft.swatchImageId;
  else if (
    draft.swatchColor !== option.swatchColor ||
    (draft.swatchImage === null && option.swatchImage !== null)
  ) {
    change.swatchColor = draft.swatchColor;
  }
  return change;
}

/**
 * An attribute's sheet (§7.6, the prototype's `sh-attr-edit` and Part 19's `sh-attr-library`, `sh-attr-edit-retired` and
 * `sh-attr-option`; ATL-01, ATR-10, ATR-18). The shop's own: its name, its type (fixed), its options each with Edit, Add
 * option, the retired ones with Bring back, Save and Retire. The library's: its name and the library's options fixed,
 * the shop's own values added and edited beside them. One option opens a step with a way back: its name, a swatch,
 * and Retire this option.
 */
export function AttributeSheet({
  attribute,
  readOnly,
  onClose,
}: {
  attribute: Attribute | null;
  readOnly: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const words = useAttributeWords();
  const update = useUpdateAttribute();
  const updateOption = useUpdateOption();
  const add = useAddOptions();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<OptionDraft>({
    value: '',
    swatchColor: null,
    swatchImage: null,
    swatchImageId: null,
  });

  const id = attribute?.id ?? null;
  useEffect(() => {
    if (id === null) return;
    setName(attribute?.name ?? '');
    setAdding(false);
    setTyped('');
    setEditing(null);
    update.reset();
    updateOption.reset();
    add.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const own = attribute?.scope === 'shop';
  const option = attribute?.options.find((each) => each.id === editing) ?? null;

  function openOption(chosen: AttributeOption): void {
    setDraft({
      value: chosen.value,
      swatchColor: chosen.swatchColor,
      swatchImage: chosen.swatchImage,
      swatchImageId: null,
    });
    updateOption.reset();
    setEditing(chosen.id);
  }

  function changeOption(body: OptionChange, after: () => void): void {
    if (!attribute || !option) return;
    if (Object.keys(body).length === 0) {
      after();
      return;
    }
    updateOption.mutate(
      { attributeId: attribute.id, optionId: option.id, body },
      { onSuccess: after },
    );
  }

  function insert(): void {
    const value = typed.trim();
    if (!attribute || value === '') return;
    add.mutate(
      { attributeId: attribute.id, values: [value] },
      {
        onSuccess: () => {
          setTyped('');
        },
      },
    );
  }

  if (attribute && option) {
    const back = () => {
      setEditing(null);
    };
    return (
      <Sheet
        open
        title={option.value}
        onClose={onClose}
        onBack={back}
        footer={
          <Button
            wide
            busy={updateOption.isPending}
            disabled={draft.value.trim() === ''}
            onClick={() => {
              changeOption(optionChange(option, draft), back);
            }}
          >
            {t('save')}
          </Button>
        }
      >
        <Field
          label={t('optionName')}
          value={draft.value}
          maxLength={OPTION_VALUE_MAX_LENGTH}
          error={draft.value.trim() === '' ? t('errName') : undefined}
          onChange={(event) => {
            setDraft({ ...draft, value: event.target.value });
          }}
        />
        <div className="flex-none rounded-card border border-line p-4">
          <SwatchPalette
            name={draft.value.trim() || option.value}
            swatch={draft}
            busy={updateOption.isPending}
            error={null}
            onPaint={(choice) => {
              setDraft(
                'swatchImageId' in choice
                  ? { ...draft, ...choice }
                  : {
                      ...draft,
                      swatchColor: choice.swatchColor,
                      swatchImage: null,
                      swatchImageId: null,
                    },
              );
            }}
          />
        </div>
        <p className="text-[14px] text-fg-muted">{t('retireOptionHint')}</p>
        {updateOption.isError ? (
          <p role="alert" className="text-[14px] font-medium text-danger-text">
            {errorText(updateOption.error)}
          </p>
        ) : null}
        <p>
          <button
            type="button"
            className="text-[14px] font-semibold text-danger-text underline"
            onClick={() => {
              changeOption({ retired: true }, back);
            }}
          >
            {t('retireOption')}
          </button>
        </p>
      </Sheet>
    );
  }

  const options = attribute?.options ?? [];
  const live = options.filter((each) => !each.retired);
  const retired = options.filter((each) => each.retired && each.scope === 'shop');
  const canEdit = (each: AttributeOption) => !readOnly && each.scope === 'shop';
  const footer = readOnly ? undefined : attribute && own ? (
    <>
      <Button
        busy={update.isPending && update.variables.body.name !== undefined}
        disabled={name.trim() === ''}
        onClick={() => {
          if (name.trim() === attribute.name) {
            onClose();
            return;
          }
          update.mutate({ id: attribute.id, body: { name: name.trim() } }, { onSuccess: onClose });
        }}
      >
        {t('save')}
      </Button>
      <Button
        tone="outline"
        busy={update.isPending && update.variables.body.retired === true}
        onClick={() => {
          update.mutate({ id: attribute.id, body: { retired: true } }, { onSuccess: onClose });
        }}
      >
        <span className="text-danger-text">{t('retire')}</span>
      </Button>
    </>
  ) : (
    <Button wide onClick={onClose}>
      {t('done')}
    </Button>
  );

  return (
    <Sheet
      open={attribute !== null}
      title={attribute?.name ?? ''}
      onClose={onClose}
      footer={footer}
    >
      {attribute ? (
        <>
          <Field
            label={t('attrName')}
            value={own ? name : attribute.name}
            maxLength={ATTRIBUTE_NAME_MAX_LENGTH}
            readOnly={!own || readOnly}
            suffix={own ? undefined : <Icon name="lock" />}
            help={own ? undefined : t('libNameFixed')}
            error={update.isError ? errorText(update.error) : undefined}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <Field
            label={t('attrType')}
            value={words.type(attribute)}
            readOnly
            help={own ? t('typeLater') : undefined}
          />
          {takesOptions(attribute.dataType) ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium text-fg-muted">{t('typeOptions')}</span>
              <div className="flex-none overflow-hidden rounded-card border border-line">
                {live.map((each) => (
                  <div
                    key={each.id}
                    className="flex min-h-12 items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 text-[15px] font-medium">
                      {each.value}
                      {own ? null : (
                        <>
                          {' '}
                          <ScopeTag scope={each.scope} />
                        </>
                      )}
                    </span>
                    {canEdit(each) ? (
                      <Button
                        tone="ghost"
                        size="xs"
                        aria-label={t('editOption', { name: each.value })}
                        onClick={() => {
                          openOption(each);
                        }}
                      >
                        {t('edit')}
                      </Button>
                    ) : null}
                  </div>
                ))}
                {readOnly ? null : adding ? (
                  <div className="px-4 py-3">
                    <Field
                      label={t('addOption')}
                      value={typed}
                      maxLength={OPTION_VALUE_MAX_LENGTH}
                      placeholder={t('optionPh')}
                      autoFocus
                      error={add.isError ? errorText(add.error) : undefined}
                      onChange={(event) => {
                        setTyped(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') insert();
                      }}
                      suffix={
                        <Button tone="outline" size="xs" busy={add.isPending} onClick={insert}>
                          {t('insert')}
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(true);
                    }}
                    className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left font-semibold text-primary"
                  >
                    <Icon name="plus" />
                    {t('addOption')}
                  </button>
                )}
              </div>
            </div>
          ) : null}
          {retired.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Eyebrow>{t('retired')}</Eyebrow>
              <div className="flex-none overflow-hidden rounded-card border border-line">
                {retired.map((each) => (
                  <div
                    key={each.id}
                    className="flex min-h-12 items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 text-[15px] font-medium text-fg-muted">
                      {each.value}
                    </span>
                    {readOnly ? null : (
                      <Button
                        tone="outline"
                        size="xs"
                        aria-label={t('bringBackNamed', { name: each.value })}
                        busy={updateOption.isPending && updateOption.variables.optionId === each.id}
                        onClick={() => {
                          updateOption.mutate({
                            attributeId: attribute.id,
                            optionId: each.id,
                            body: { retired: false },
                          });
                        }}
                      >
                        {t('bringBack')}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <p className="text-[14px] text-fg-muted">{own ? t('retireNote') : t('libOptions')}</p>
        </>
      ) : null}
    </Sheet>
  );
}
