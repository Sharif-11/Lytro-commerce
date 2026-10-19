import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings, useUpdateSetting } from '@/api/settings';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { Card, CheckboxRow, EmptyLine, Page, PageHeader } from '@/components/ui/fields';
import { ErrorBanner } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';
import { formatDateTime } from '@/lib/dates';
import type { PlatformSetting } from '@/types/operator';

/** LIF-26: every platform-wide value that is not a rate (trial length, top-up bounds, lifecycle stage
    lengths), edited in place. The server tells each key's type by its current value. */
export function Settings(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSetting();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [draftFlag, setDraftFlag] = useState(false);

  function startEdit(setting: PlatformSetting): void {
    update.reset();
    setEditing(setting.key);
    if (typeof setting.value === 'boolean') setDraftFlag(setting.value);
    else setDraft(String(setting.value));
  }

  function cancelEdit(): void {
    update.reset();
    setEditing(null);
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>, setting: PlatformSetting): void {
    event.preventDefault();
    const value =
      typeof setting.value === 'boolean'
        ? draftFlag
        : typeof setting.value === 'number'
          ? Number(draft)
          : draft;
    update.mutate({ key: setting.key, value }, { onSuccess: cancelEdit });
  }

  return (
    <Page narrow>
      <PageHeader title={t('settings.title')} lead={t('settings.lead')} />
      {settings.isLoading ? <EmptyLine>{t('common.loading')}</EmptyLine> : null}
      {settings.isError ? <ErrorBanner message={errorMessage(settings.error, t)} /> : null}
      {settings.data?.map((setting) => (
        <Card key={setting.key}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-fg">
                {t(`settingNames.${setting.key}`, { defaultValue: setting.key })}
              </p>
              <p className="text-[13px] text-fg-muted">{setting.description}</p>
              <p className="mt-1 text-[12px] text-fg-muted">
                {t('settings.updatedAt', {
                  date: formatDateTime(setting.updatedAt, i18n.language),
                })}
              </p>
            </div>
            {editing === setting.key ? null : (
              <div className="flex items-center gap-3">
                <span className="num text-[20px] font-bold text-fg">
                  {typeof setting.value === 'boolean'
                    ? setting.value
                      ? t('common.on')
                      : t('common.off')
                    : String(setting.value)}
                </span>
                <Button
                  type="button"
                  tone="outline"
                  small
                  fit
                  onClick={() => {
                    startEdit(setting);
                  }}
                >
                  {t('common.edit')}
                </Button>
              </div>
            )}
          </div>
          {editing === setting.key ? (
            <form
              onSubmit={(event) => {
                handleSubmit(event, setting);
              }}
              className="mt-4 space-y-3"
            >
              {typeof setting.value === 'boolean' ? (
                <CheckboxRow
                  label={t('settings.enabled')}
                  checked={draftFlag}
                  onChange={setDraftFlag}
                />
              ) : (
                <TextField
                  label={t('settings.newValue')}
                  name={`value-${setting.key}`}
                  type={typeof setting.value === 'number' ? 'number' : 'text'}
                  step="any"
                  required
                  autoFocus
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                  }}
                />
              )}
              {update.isError ? <ErrorBanner message={errorMessage(update.error, t)} /> : null}
              <div className="flex gap-2">
                <Button type="submit" fit loading={update.isPending}>
                  {t('common.save')}
                </Button>
                <Button type="button" tone="outline" fit onClick={cancelEdit}>
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          ) : null}
        </Card>
      ))}
    </Page>
  );
}
