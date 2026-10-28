import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  OPTION_SET_MAX_OPTIONS,
  OPTION_SET_NAME_MAX_LENGTH,
  OPTION_VALUE_MAX_LENGTH,
  Permission,
} from '@lytronix/validators';
import {
  useAttributes,
  useDeleteOptionSet,
  useOptionSets,
  useSaveOptionSet,
} from '@/api/attributes';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { RowList, RowText, rowClass } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useErrorText } from '@/hooks/use-error-text';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { AttributeChips } from './attribute-chips';
import { ScopeTag } from './scope-tag';

/**
 * New set (Part 19's `sh-optset-new`, ATR-16): a name and its options, typed and inserted as an options sheet does,
 * each taken off by its x. A set is never edited; one with a typo is deleted and made again.
 */
function NewSetSheet({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const save = useSaveOptionSet();
  const [name, setName] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setOptions([]);
    setTyped('');
    setTried(false);
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function insert(): void {
    const value = typed.trim();
    if (value === '' || options.length >= OPTION_SET_MAX_OPTIONS) return;
    if (!options.some((each) => each.toLowerCase() === value.toLowerCase())) {
      setOptions([...options, value]);
    }
    setTyped('');
  }

  return (
    <Sheet
      open={open}
      title={t('newSet')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={save.isPending}
          onClick={() => {
            setTried(true);
            if (name.trim() === '' || options.length === 0) return;
            save.mutate({ name: name.trim(), options }, { onSuccess: onClose });
          }}
        >
          {t('save')}
        </Button>
      }
    >
      <Field
        label={t('setName')}
        value={name}
        maxLength={OPTION_SET_NAME_MAX_LENGTH}
        placeholder={t('setNamePh')}
        error={tried && name.trim() === '' ? t('errName') : undefined}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium text-fg-muted">{t('setValues')}</span>
        {options.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {options.map((each) => (
              <Chip
                key={each}
                aria-label={t('removeOption', { name: each })}
                onClick={() => {
                  setOptions(options.filter((option) => option !== each));
                }}
              >
                {each}
                <Icon name="x" size={14} />
              </Chip>
            ))}
          </div>
        ) : tried ? (
          <p className="text-[13px] font-medium text-danger">{t('setNeedsOptions')}</p>
        ) : null}
      </div>
      <Field
        label={t('addOption')}
        value={typed}
        maxLength={OPTION_VALUE_MAX_LENGTH}
        placeholder={t('optionPh')}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') insert();
        }}
        suffix={
          <Button tone="outline" size="xs" onClick={insert}>
            {t('insert')}
          </Button>
        }
      />
      <p className="text-[14px] text-fg-muted">{t('setHint')}</p>
      {save.isError ? (
        <p role="alert" className="text-[14px] font-medium text-danger-text">
          {errorText(save.error)}
        </p>
      ) : null}
    </Sheet>
  );
}

/**
 * Option sets (§7.6, the prototype's `option-sets`; ATR-16): the library's sets and the shop's own, each with its
 * options; the shop's own are deleted from their row, never edited; New set makes one.
 */
export function OptionSetsView(): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const { slug, viewer } = useShell();
  const mayManage = allows(viewer, [Permission.ProductsManage]);
  const sets = useOptionSets();
  const attributes = useAttributes();
  const remove = useDeleteOptionSet();
  const [making, setMaking] = useState(false);

  return (
    <ShellPage
      actions={
        mayManage ? (
          <Button
            size="sm"
            onClick={() => {
              setMaking(true);
            }}
          >
            <Icon name="plus" />
            {t('newSet')}
          </Button>
        ) : null
      }
    >
      <AttributeChips
        slug={slug}
        current="sets"
        attributes={attributes.data?.length}
        sets={sets.data?.length}
      />
      {sets.isError ? <Banner tone="bad">{errorText(sets.error)}</Banner> : null}
      {remove.isError ? <Banner tone="bad">{errorText(remove.error)}</Banner> : null}
      {sets.isPending ? (
        <Card flush>
          <SkeletonRows count={4} />
        </Card>
      ) : (
        <Card flush>
          <RowList>
            {(sets.data ?? []).map((set) => (
              <div key={set.id} className={rowClass}>
                <RowText
                  title={
                    <>
                      {set.name} <ScopeTag scope={set.scope} />
                    </>
                  }
                  sub={set.options.join(' · ')}
                />
                {set.scope === 'shop' && mayManage ? (
                  <Button
                    tone="ghost"
                    size="xs"
                    aria-label={t('deleteSet', { name: set.name })}
                    busy={remove.isPending && remove.variables === set.id}
                    onClick={() => {
                      remove.mutate(set.id);
                    }}
                  >
                    {t('delete')}
                  </Button>
                ) : null}
              </div>
            ))}
          </RowList>
        </Card>
      )}
      <NewSetSheet
        open={making}
        onClose={() => {
          setMaking(false);
        }}
      />
    </ShellPage>
  );
}
