import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError, errorMessage } from '@lytronix/api-client';
import { Button, ErrorBanner, TextField } from '@lytronix/ui';
import { useRegenerateBackupCodes } from '@/api/operator-auth';
import { Panel } from '@/components/ui/panel';
import { BackupCodes } from '@/views/sign-in/backup-codes';
import { typedCode } from '@/views/sign-in/typed-code';

const FORM = 'new-backup-codes';

/** Which field a refusal belongs under: a wrong code says the tries left, a wrong password doesn't; the rest neither. */
function fieldOf(error: unknown): 'code' | 'password' | null {
  if (!(error instanceof ApiClientError) || error.status !== 401) return null;
  return error.details.attemptsLeft === undefined ? 'password' : 'code';
}

/**
 * New backup codes (ADM-01): a step-up with the password and a fresh code, then the new codes shown once. The panel holds
 * those codes through a stray tap or Escape, since nothing can show them again.
 */
export function CodesPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const regenerate = useRegenerateBackupCodes();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  function close(): void {
    regenerate.reset();
    setPassword('');
    setCode('');
    onClose();
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    regenerate.mutate({ password, code: typedCode(code) });
  }

  if (regenerate.data) {
    return (
      <Panel
        open={open}
        title={t('account.codes')}
        sub={t('account.generated')}
        onClose={close}
        dismissable={false}
        footer={
          <Button type="button" small fit onClick={close}>
            {t('backupCodes.continue')}
          </Button>
        }
      >
        <BackupCodes codes={regenerate.data.backupCodes} />
      </Panel>
    );
  }

  const refusedField = fieldOf(regenerate.error);
  const message = regenerate.error ? errorMessage(regenerate.error, t) : undefined;

  return (
    <Panel
      open={open}
      title={t('account.newTitle')}
      onClose={close}
      dismissable={!regenerate.isPending}
      footerInRow
      footer={
        <>
          <Button
            type="button"
            tone="outline"
            small
            fit
            disabled={regenerate.isPending}
            className="flex-1 sm:flex-none"
            onClick={close}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form={FORM}
            small
            fit
            loading={regenerate.isPending}
            className="flex-1 sm:flex-none"
          >
            {t('account.generate')}
          </Button>
        </>
      }
    >
      <div className="rounded-lg border border-l-[3px] border-line border-l-danger bg-neutral-50 px-3.5 py-3 text-[14px] leading-[1.55]">
        {t('account.newConsequence')}
      </div>
      <form id={FORM} onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <TextField
          label={t('signIn.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          data-autofocus
          error={refusedField === 'password' ? message : undefined}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
        <TextField
          label={t('account.freshCode')}
          name="code"
          autoComplete="one-time-code"
          inputMode="numeric"
          required
          minLength={6}
          mono
          placeholder="000 000"
          error={refusedField === 'code' ? message : undefined}
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
          }}
        />
        {message && refusedField === null ? <ErrorBanner message={message} /> : null}
      </form>
    </Panel>
  );
}
