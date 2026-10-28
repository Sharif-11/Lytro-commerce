import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { AttributeDataType, AttributeRole } from '@lytronix/validators';
import { useCreateAttribute, type AttributeDraft } from '@/api/attributes';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chips';
import { Eyebrow } from '@/components/ui/page';
import { SearchField } from '@/components/ui/search-field';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { roleRefusals, type RoleRefusal } from '@/lib/variant-matrix';
import type { Attribute } from '@/types/attribute';
import { ATTRIBUTE_ICONS } from './attribute-icons';
import { NewAttributeFields } from './new-attribute-fields';
import { useVariantWords } from './variant-words';

const ROLES = [
  AttributeRole.Informational,
  AttributeRole.VariantDefining,
  AttributeRole.CapturedAtOrder,
] as const;

/**
 * Add attribute (§7.4's sheet, the prototype's `sh-attribute` and Part 14's states; ATR-01, ATR-02, ATR-11, ATL-02): a
 * search over the library and the shop's own, the category's suggestions as chips, and "Create …" for a new name, a
 * step of its own with a way back (name, type, what a number measures). The role it takes on the product follows: a
 * role its type cannot take, or a 4th splitting attribute, is greyed with why.
 */
export function AddAttributeSheet({
  open,
  attributes,
  suggestedIds,
  takenIds,
  splitNames,
  preselect,
  onAdd,
  onClose,
}: {
  open: boolean;
  /** The library's attributes and the shop's own. */
  attributes: readonly Attribute[];
  /** ATR-02: the category's suggestions, then the shop type's. */
  suggestedIds: readonly string[];
  /** The attributes the product already has, in any role. */
  takenIds: readonly string[];
  /** The attributes that split the product now, by name. */
  splitNames: readonly string[];
  /** A suggestion tapped on the card, picked as the sheet opens. */
  preselect: string | null;
  onAdd: (attribute: Attribute, role: AttributeRole) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const words = useVariantWords();
  const errorText = useErrorText();
  const create = useCreateAttribute();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Attribute | null>(null);
  const [role, setRole] = useState<AttributeRole>(AttributeRole.Informational);
  const [draft, setDraft] = useState<AttributeDraft | null>(null);
  const [made, setMade] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const chosen = attributes.find((each) => each.id === preselect) ?? null;
    setQuery('');
    setPicked(chosen);
    setRole(AttributeRole.Informational);
    setDraft(null);
    setMade(null);
    create.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const live = attributes.filter((each) => !each.retired && !takenIds.includes(each.id));
  const search = query.trim().toLowerCase();
  const found = live.filter((each) => search === '' || each.name.toLowerCase().includes(search));
  const exact = attributes.some((each) => each.name.toLowerCase() === search);
  const suggested = suggestedIds
    .map((id) => live.find((each) => each.id === id))
    .filter((each): each is Attribute => each !== undefined);
  const splitting = splitNames.length;
  const refusals = picked ? roleRefusals(picked.dataType, splitting) : {};

  function pick(attribute: Attribute): void {
    setPicked(attribute);
    setRole(AttributeRole.Informational);
  }

  function make(): void {
    if (!draft || draft.name.trim() === '') return;
    create.mutate(draft, {
      onSuccess: (attribute) => {
        setDraft(null);
        setMade(attribute.id);
        setQuery(attribute.name);
        setPicked(attribute);
        setRole(
          roleRefusals(attribute.dataType, splitting)[AttributeRole.VariantDefining]
            ? AttributeRole.Informational
            : AttributeRole.VariantDefining,
        );
      },
      onError: (error) => {
        // ATR-01: a name the shop already sees is that attribute, picked instead.
        const id = error instanceof ApiClientError ? error.details.attributeId : undefined;
        const known = attributes.find((each) => each.id === id);
        if (known) {
          setDraft(null);
          pick(known);
        }
      },
    });
  }

  const refusalText = (refusal: RoleRefusal | undefined): string | null => {
    switch (refusal) {
      case 'needsOptions':
        return t('needsOptions');
      case 'textOrNumber':
        return t('needsTextNum');
      case 'full':
        return t('splitFull', { names: splitNames.join(', ') });
      default:
        return null;
    }
  };
  const roleWords: Record<AttributeRole, string> = {
    [AttributeRole.Informational]: t('describesLong'),
    [AttributeRole.VariantDefining]: t('splitsLong'),
    [AttributeRole.CapturedAtOrder]: t('askedAtOrder'),
  };

  if (draft) {
    return (
      <Sheet
        open={open}
        title={t('newAttr')}
        onClose={onClose}
        onBack={() => {
          setDraft(null);
        }}
        footer={
          <Button wide busy={create.isPending} disabled={draft.name.trim() === ''} onClick={make}>
            {t('createPick')}
          </Button>
        }
      >
        <NewAttributeFields
          draft={draft}
          error={create.isError ? errorText(create.error) : undefined}
          onChange={setDraft}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      title={t('addAttribute')}
      onClose={onClose}
      footer={
        <Button
          wide
          disabled={picked === null}
          onClick={() => {
            if (picked) onAdd(picked, role);
          }}
        >
          {t('done')}
        </Button>
      }
    >
      {open ? (
        <div className="flex flex-col gap-3">
          <SearchField
            label={t('searchAttr')}
            placeholder={t('searchAttr')}
            value={query}
            onChange={(value) => {
              setQuery(value);
              if (picked && picked.name !== value) setPicked(null);
            }}
          />
          {search === '' && suggested.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Eyebrow>{t('suggestedHere')}</Eyebrow>
              <div className="flex flex-wrap gap-2">
                {suggested.map((each) => (
                  <Chip
                    key={each.id}
                    size="lg"
                    on={picked?.id === each.id}
                    onClick={() => {
                      pick(each);
                    }}
                  >
                    {each.name}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex-none overflow-hidden rounded-card border border-line">
            {(picked && !found.some((each) => each.id === picked.id)
              ? [picked, ...found]
              : found
            ).map((each) => (
              <button
                key={each.id}
                type="button"
                aria-pressed={picked?.id === each.id}
                className={[
                  'flex min-h-[52px] w-full items-center gap-3 border-b border-line px-4 py-2 text-left last:border-b-0',
                  picked?.id === each.id ? 'bg-brand-50' : '',
                ].join(' ')}
                onClick={() => {
                  pick(each);
                }}
              >
                <span className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-neutral-100 text-fg-muted">
                  <Icon name={ATTRIBUTE_ICONS[each.dataType]} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px]">{each.name}</span>
                  <span className="text-[13px] text-fg-muted">
                    {words.type(each.dataType)} ·{' '}
                    {each.scope === 'platform' ? t('library') : t('own')}
                    {made === each.id ? ` · ${t('justMade')}` : ''}
                  </span>
                </span>
                {picked?.id === each.id ? <Icon name="check" /> : null}
              </button>
            ))}
            {search !== '' && !exact ? (
              <button
                type="button"
                className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left text-primary"
                onClick={() => {
                  create.reset();
                  setDraft({
                    name: query.trim(),
                    dataType: AttributeDataType.EnumSingle,
                    unitKind: null,
                  });
                }}
              >
                <span className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-info-soft text-info">
                  <Icon name="plus" />
                </span>
                <span className="text-[15px] font-semibold">
                  {t('createAs', { name: query.trim() })}
                </span>
              </button>
            ) : found.length === 0 && !picked ? (
              <p className="px-4 py-3 text-[14px] text-fg-muted">{t('noAttributes')}</p>
            ) : null}
          </div>
          {picked ? (
            <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={t('roleOn')}>
              <span className="text-[14px] font-medium text-fg-muted">{t('roleOn')}</span>
              <div className="overflow-hidden rounded-card border border-line">
                {ROLES.map((each) => {
                  const refusal = refusals[each];
                  const why = refusalText(refusal);
                  return (
                    <button
                      key={each}
                      type="button"
                      role="radio"
                      aria-checked={role === each}
                      disabled={refusal !== undefined}
                      className="flex min-h-11 w-full items-center gap-3 border-b border-line px-4 py-2 text-left last:border-b-0"
                      onClick={() => {
                        setRole(each);
                      }}
                    >
                      <span
                        className={[
                          'flex size-[22px] flex-none items-center justify-center rounded-full border-2',
                          refusal
                            ? 'border-line bg-neutral-100'
                            : role === each
                              ? 'border-primary'
                              : 'border-line-strong',
                        ].join(' ')}
                      >
                        {role === each && !refusal ? (
                          <span className="size-2.5 rounded-full bg-primary" />
                        ) : null}
                      </span>
                      <span className="flex flex-col">
                        <span className="text-[15px]">{roleWords[each]}</span>
                        {each === AttributeRole.VariantDefining && !refusal ? (
                          <span className="text-[13px] text-fg-muted">{t('needsOptions')}</span>
                        ) : why ? (
                          <span className="text-[13px] text-fg-muted">{why}</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
