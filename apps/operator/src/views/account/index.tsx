import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useRegenerateBackupCodes } from '@/api/operator-auth';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, Page, PageHeader } from '@/components/ui/fields';
import { ErrorBanner } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';
import { BackupCodesStep } from '@/views/sign-in/backup-codes-step';

/** The operator's own account: new backup codes, which re-asserts the password and a fresh code. */
export function Account(): React.JSX.Element {
  const { t } = useTranslation();
  const regenerate = useRegenerateBackupCodes();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    regenerate.mutate({ email: email.trim(), password, code: code.trim() });
  }

  return (
    <Page narrow>
      <PageHeader title={t('account.title')} lead={t('account.lead')} />
      <Card>
        <CardTitle>{t('account.regenerateTitle')}</CardTitle>
        {regenerate.data ? (
          <div className="mt-4 space-y-3">
            <p className="text-[14px] text-fg-muted">{t('account.regenerated')}</p>
            <BackupCodesStep
              codes={regenerate.data.backupCodes}
              continueLabel={t('common.close')}
              onContinue={() => {
                regenerate.reset();
                setPassword('');
                setCode('');
              }}
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <p className="text-[14px] text-fg-muted">{t('account.regenerateLead')}</p>
            <TextField
              label={t('signIn.email')}
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
            <TextField
              label={t('signIn.password')}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
            <TextField
              label={t('verify.codeLabel')}
              name="code"
              autoComplete="one-time-code"
              required
              mono
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
            />
            {regenerate.isError ? (
              <ErrorBanner message={errorMessage(regenerate.error, t)} />
            ) : null}
            <Button type="submit" tone="outline" fit loading={regenerate.isPending}>
              {t('account.regenerate')}
            </Button>
          </form>
        )}
      </Card>
    </Page>
  );
}
