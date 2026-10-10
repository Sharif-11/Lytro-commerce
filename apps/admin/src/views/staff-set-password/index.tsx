import { useState, type SyntheticEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { setPasswordSchema } from '@lytronix/validators';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';
import { errorMessage } from '@/api/error-message';
import { tenantSession } from '@/session/tenant-session';
import { LockIcon } from '@/components/icons';

/**
 * Reached only when the owner set (or reset) this staff member's password — StaffService.changePassword's
 * `pending` flag skips the current-password check server-side for exactly this path, the same AUTH-20
 * carve-out class as the owner's own SetPassword screen, so the payload shape is identical ({newPassword}
 * only) even though the two screens post to different endpoints (/auth/staff/password here, not
 * /auth/password — StaffAuthController is a separate controller from the owner's, with its own session
 * shape). No skip button: unlike the owner's optional post-signup password, this is always mandatory —
 * StaffSigninService only ever routes here when mustSetPassword is true.
 */
export function StaffSetPassword(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      tenantSession.client.post<{ ok: true }>(
        '/auth/staff/password',
        setPasswordSchema.parse({ newPassword }),
      ),
    onSuccess: () => {
      void navigate({ to: '/dashboard' });
    },
  });

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = setPasswordSchema.safeParse({ newPassword });
    if (!result.success) {
      setFormError(result.error.issues[0]?.message ?? t('errors.validation'));
      return;
    }
    setFormError(null);
    mutation.mutate();
  }

  return (
    <AuthCard title={t('auth.setPassword.title')} subtitle={t('auth.staffSetPassword.subtitle')}>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <TextField
          label={t('auth.setPassword.newPasswordLabel')}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          icon={<LockIcon />}
          value={newPassword}
          onChange={(event) => {
            setNewPassword(event.target.value);
          }}
          error={formError ?? undefined}
        />
        {mutation.isError ? <ErrorBanner message={errorMessage(mutation.error, t)} /> : null}
        <Button type="submit" loading={mutation.isPending}>
          {t('auth.setPassword.submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
