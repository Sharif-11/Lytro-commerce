import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import {
  useCreateTaxClass,
  useDeleteTaxClass,
  useSetDefaultTaxClass,
  useTaxClasses,
  useUpdateTaxClass,
} from '@/api/tax-classes';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, SelectField } from '@/components/ui/field';
import { RowList, RowLead } from '@/components/ui/list-row';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useErrorText } from '@/hooks/use-error-text';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { TaxClass } from '@/types/tax';

/** A rate as typed: 0 to 100, up to two decimals. */
const RATE = /^\d{1,3}(\.\d{1,2})?$/;
const rateOf = (typed: string): number | null => {
  const value = typed.trim();
  return RATE.test(value) && Number(value) <= 100 ? Number(value) : null;
};
const rateText = (rate: string): string => String(Number(rate));

/**
 * Settings > Tax (TENANT-DASHBOARD-DESIGN §7.33, the prototype's `tax31`; TAX-01): what a class does in one line, the
 * classes with their rates and the default marked, and New products start with. No classes: prices carry no tax.
 */
export function TaxView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const taxes = useTaxClasses();
  const setDefault = useSetDefaultTaxClass();
  const [sheet, setSheet] = useState<'new' | TaxClass | null>(null);
  const classes = taxes.data?.classes ?? [];
  const add = (
    <Button
      size="sm"
      onClick={() => {
        setSheet('new');
      }}
    >
      <Icon name="plus" />
      {t('taxAdd')}
    </Button>
  );
  return (
    <ShellPage actions={classes.length > 0 ? add : undefined}>
      <div className="flex max-w-[640px] flex-col gap-3.5">
        {taxes.isError ? <Banner tone="bad">{errorText(taxes.error)}</Banner> : null}
        {taxes.isPending ? (
          <Card flush>
            <SkeletonRows count={3} />
          </Card>
        ) : classes.length === 0 && taxes.isSuccess ? (
          <Card>
            <EmptyState icon="percent" action={add}>
              {t('taxEmpty')}
            </EmptyState>
          </Card>
        ) : (
          <>
            <p className="text-[14px]">{t('taxLead')}</p>
            <Card flush>
              <RowList>
                {classes.map((each) => (
                  <button
                    key={each.id}
                    type="button"
                    className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
                    onClick={() => {
                      setSheet(each);
                    }}
                  >
                    <RowLead>
                      <Icon name="percent" />
                    </RowLead>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[16px] font-medium">
                        {each.name}
                        {each.id === taxes.data?.defaultId ? (
                          <>
                            {' '}
                            <StatusTag tone="info">{t('taxDefaultTag')}</StatusTag>
                          </>
                        ) : null}
                      </span>
                      <span className="num text-[14px] text-fg-muted">{rateText(each.rate)}%</span>
                    </span>
                    <Icon name="right" />
                  </button>
                ))}
              </RowList>
            </Card>
            <Card className="flex flex-col gap-2">
              <h3 className="mb-1 text-[17px] font-semibold">{t('taxDefaultT')}</h3>
              <SelectField
                label={<span className="sr-only">{t('taxDefaultT')}</span>}
                value={taxes.data?.defaultId ?? ''}
                disabled={setDefault.isPending}
                options={[
                  ...classes.map((each) => ({ value: each.id, label: each.name })),
                  { value: '', label: t('taxNone') },
                ]}
                onChange={(event) => {
                  setDefault.mutate(event.target.value || null);
                }}
              />
              {setDefault.isError ? (
                <Banner tone="bad">{errorText(setDefault.error)}</Banner>
              ) : null}
            </Card>
          </>
        )}
      </div>
      {sheet === 'new' ? (
        <NewClassSheet
          onClose={() => {
            setSheet(null);
          }}
        />
      ) : sheet ? (
        <EditClassSheet
          key={sheet.id}
          each={sheet}
          onClose={() => {
            setSheet(null);
          }}
        />
      ) : null}
    </ShellPage>
  );
}

/** A new class (`sh-tax31-new`): its name, its rate, and whether new products start with it. */
function NewClassSheet({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const { showToast } = useShell();
  const create = useCreateTaxClass();
  const setDefault = useSetDefaultTaxClass();
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);
  const problems = problem instanceof ApiClientError ? problem.fieldProblems() : {};
  const value = rateOf(rate);

  const save = async (): Promise<void> => {
    if (value === null) return;
    const typed = name.trim();
    setProblem(null);
    try {
      const after = await create.mutateAsync({ name: typed, rate: value });
      // The answer names no new id; a class's name is the shop's alone, whatever its case.
      const made = after.classes.find((each) => each.name.toLowerCase() === typed.toLowerCase());
      if (isDefault && made) await setDefault.mutateAsync(made.id);
      showToast(t('taxSaved', { name: typed }));
      onClose();
    } catch (error) {
      setProblem(error);
    }
  };

  return (
    <Sheet
      open
      title={t('taxNewT')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={create.isPending || setDefault.isPending}
          disabled={name.trim() === '' || value === null}
          onClick={() => {
            void save();
          }}
        >
          {t('taxSave')}
        </Button>
      }
    >
      {problem !== null && !problems.name && !problems.rate ? (
        <Banner tone="bad">{errorText(problem)}</Banner>
      ) : null}
      <Field
        label={t('taxName')}
        value={name}
        placeholder={t('taxNamePh')}
        error={problems.name}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <Field
        label={t('taxRate')}
        value={rate}
        inputMode="decimal"
        placeholder="15"
        help={t('taxRateHelp')}
        error={rate.trim() !== '' && value === null ? t('taxRateHelp') : problems.rate}
        onChange={(event) => {
          setRate(event.target.value);
        }}
      />
      <div className="flex min-h-11 items-center gap-3">
        <Switch checked={isDefault} label={t('taxMakeDefault')} onChange={setIsDefault} />
        <span className="text-[15px] font-medium">{t('taxMakeDefault')}</span>
      </div>
    </Sheet>
  );
}

/** A class (`sh-tax31-edit`): its name or rate; deleting it is refused while products use it (`sh-tax31-inuse`). */
function EditClassSheet({
  each,
  onClose,
}: {
  each: TaxClass;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const { showToast } = useShell();
  const update = useUpdateTaxClass(each.id);
  const remove = useDeleteTaxClass(each.id);
  const [name, setName] = useState(each.name);
  const [rate, setRate] = useState(rateText(each.rate));
  const [inUse, setInUse] = useState(false);
  const failure = update.error ?? remove.error;
  const problems = update.error instanceof ApiClientError ? update.error.fieldProblems() : {};
  const value = rateOf(rate);

  const save = (): void => {
    if (value === null) return;
    const typed = name.trim();
    update.mutate(
      {
        ...(typed !== each.name ? { name: typed } : {}),
        ...(value !== Number(each.rate) ? { rate: value } : {}),
      },
      {
        onSuccess: () => {
          showToast(t('taxSaved', { name: typed }));
          onClose();
        },
      },
    );
  };

  if (inUse) {
    return (
      <Dialog
        open
        title={t('taxInUseT', { name: each.name })}
        onClose={onClose}
        actions={<Button onClick={onClose}>{t('taxOk')}</Button>}
      >
        {t('taxInUseP')}
      </Dialog>
    );
  }
  const changed = name.trim() !== each.name || value !== Number(each.rate);
  return (
    <Sheet
      open
      title={each.name}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={update.isPending}
          disabled={name.trim() === '' || value === null}
          onClick={() => {
            if (changed) save();
            else onClose();
          }}
        >
          {t('taxSave')}
        </Button>
      }
    >
      {failure && !problems.name && !problems.rate ? (
        <Banner tone="bad">{errorText(failure)}</Banner>
      ) : null}
      <Field
        label={t('taxName')}
        value={name}
        error={problems.name}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <Field
        label={t('taxRate')}
        value={rate}
        inputMode="decimal"
        help={t('taxRateChange')}
        error={value === null ? t('taxRateHelp') : problems.rate}
        onChange={(event) => {
          setRate(event.target.value);
        }}
      />
      <div className="mt-1">
        <Button
          tone="ghost"
          size="sm"
          busy={remove.isPending}
          onClick={() => {
            remove.mutate(undefined, {
              onSuccess: () => {
                showToast(t('taxDeleted', { name: each.name }));
                onClose();
              },
              onError: (error) => {
                if (error instanceof ApiClientError && error.status === 409) setInUse(true);
              },
            });
          }}
        >
          <span className="text-danger">{t('taxDelete')}</span>
        </Button>
      </div>
    </Sheet>
  );
}
