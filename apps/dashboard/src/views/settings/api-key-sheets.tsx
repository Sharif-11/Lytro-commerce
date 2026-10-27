import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { API_KEY_NAME_MAX_LENGTH } from '@lytronix/validators';
import { useCreateApiKey, useRevokeApiKey, useUpdateApiKey } from '@/api/api-keys';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/classes';
import { CopyButton } from '@/components/ui/copy-button';
import { AreaField, Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { formatDayMonthYear } from '@/lib/dates';
import type { ApiKey, CreatedApiKey } from '@/types/api-key';
import { expiryOf, websitesOf, websitesProblem } from './api-key-words';

const problemsOf = (error: unknown): Record<string, string> =>
  error instanceof ApiClientError ? error.fieldProblems() : {};

/**
 * A new key (API-01, the prototype's `sh-key-new`): its name, the websites it may be used from, one a line (API-08),
 * and when it stops working, if ever. The server makes the key and answers its value once.
 */
export function NewKeySheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (key: CreatedApiKey) => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const create = useCreateApiKey();
  const [name, setName] = useState('');
  const [websites, setWebsites] = useState('');
  const [expiry, setExpiry] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setWebsites('');
    setExpiry('');
    create.reset();
    // The mutation is stable; opening the sheet is what starts it afresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const problems = problemsOf(create.error);
  return (
    <Sheet
      open={open}
      title={t('akNew')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={create.isPending}
          onClick={() => {
            create.mutate(
              { name: name.trim(), websites: websitesOf(websites), expiresAt: expiryOf(expiry) },
              { onSuccess: onCreated },
            );
          }}
        >
          {t('akCreate')}
        </Button>
      }
    >
      <Field
        label={t('akName')}
        name="keyName"
        autoComplete="off"
        maxLength={API_KEY_NAME_MAX_LENGTH}
        placeholder={t('akNamePh')}
        value={name}
        error={problems['name']}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <AreaField
        label={t('akSites')}
        name="websites"
        placeholder="https://"
        help={t('akSitesHelp')}
        value={websites}
        error={websitesProblem(problems)}
        onChange={(event) => {
          setWebsites(event.target.value);
        }}
      />
      <Field
        label={t('akExpiry')}
        name="expiresAt"
        type="date"
        value={expiry}
        error={problems['expiresAt']}
        onChange={(event) => {
          setExpiry(event.target.value);
        }}
      />
      {create.isError && Object.keys(problems).length === 0 ? (
        <Banner tone="bad">{errorText(create.error)}</Banner>
      ) : null}
    </Sheet>
  );
}

/** API-01 (the prototype's `sh-key-created`): the key's value, this one time, with Copy and Download. */
export function CreatedKeySheet({
  created,
  onClose,
}: {
  created: CreatedApiKey | null;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const value = created?.key ?? '';
  return (
    <Sheet
      open={created !== null}
      title={t('akCreatedTitle')}
      onClose={onClose}
      footer={
        <Button wide onClick={onClose}>
          {t('done')}
        </Button>
      }
    >
      <p className="text-[14px] text-fg-muted">{t('akCreatedLead')}</p>
      <output className="rounded-[8px] border border-line bg-neutral-50 px-3 py-2.5 font-mono text-[13px] break-all">
        {value}
      </output>
      <div className="flex gap-2">
        <CopyButton key={value} text={value} size="sm" icon />
        <a
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(value)}`}
          download={`lytro-api-key-${created?.prefix ?? 'key'}.txt`}
          className={buttonClass('outline', 'sm')}
        >
          <Icon name="download" />
          {t('akDownload')}
        </a>
      </div>
    </Sheet>
  );
}

/** API-03 (the prototype's `sh-key-revoke`): what revoking does, at once, and how to change keys without a break. */
export function RevokeKeySheet({
  revoking,
  onClose,
  onRevoked,
}: {
  revoking: ApiKey | null;
  onClose: () => void;
  onRevoked: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const revoke = useRevokeApiKey();
  useEffect(() => {
    revoke.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revoking]);
  return (
    <Sheet
      open={revoking !== null}
      title={t('akRevokeTitle')}
      onClose={onClose}
      footer={
        <Button
          tone="danger"
          wide
          busy={revoke.isPending}
          onClick={() => {
            if (revoking) revoke.mutate(revoking.id, { onSuccess: onRevoked });
          }}
        >
          {t('akRevoke')}
        </Button>
      }
    >
      <p className="text-[15px]">{t('akRevokeCons')}</p>
      {revoke.isError ? <Banner tone="bad">{errorText(revoke.error)}</Banner> : null}
    </Sheet>
  );
}

/**
 * A live key's name and websites (API-01, API-08, the prototype's `sh-key-edit`); its expiry is shown, set when it was
 * made, and its value is never shown again.
 */
export function EditKeySheet({
  editing,
  onClose,
  onSaved,
}: {
  editing: ApiKey | null;
  onClose: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const update = useUpdateApiKey();
  const [name, setName] = useState('');
  const [websites, setWebsites] = useState('');

  useEffect(() => {
    if (!editing) return;
    setName(editing.name);
    setWebsites(editing.websites.join('\n'));
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const problems = problemsOf(update.error);
  return (
    <Sheet
      open={editing !== null}
      title={t('akEditTitle')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={update.isPending}
          onClick={() => {
            if (!editing) return;
            update.mutate(
              { id: editing.id, name: name.trim(), websites: websitesOf(websites) },
              { onSuccess: onSaved },
            );
          }}
        >
          {t('save')}
        </Button>
      }
    >
      <Field
        label={t('akName')}
        name="keyName"
        autoComplete="off"
        maxLength={API_KEY_NAME_MAX_LENGTH}
        value={name}
        error={problems['name']}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <AreaField
        label={t('akSites')}
        name="websites"
        help={t('akSitesHelp')}
        value={websites}
        error={websitesProblem(problems)}
        onChange={(event) => {
          setWebsites(event.target.value);
        }}
      />
      <Field
        label={t('akExpiry')}
        name="expiresAt"
        readOnly
        value={editing?.expiresAt ? formatDayMonthYear(editing.expiresAt) : '—'}
      />
      <p className="text-[14px] text-fg-muted">{t('akValueNever')}</p>
      {update.isError && Object.keys(problems).length === 0 ? (
        <Banner tone="bad">{errorText(update.error)}</Banner>
      ) : null}
    </Sheet>
  );
}
