import { useState, type SyntheticEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { setPasswordSchema } from '@lytronix/validators';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';
import { errorMessage } from '@/api/error-message';
import { tenantSession } from '@/session/tenant-session';
import { LockIcon } from '@/components/icons';

// currentPassword is deliberately never sent: every path that reaches this screen in this slice is a fresh
// sign-up (create-shop just finished) or a forgot-password reset (must_set_password) — AUTH-20's two
// carve-outs for skipping currentPassword, so there is never an existing password to confirm here.
export function SetPassword(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: '/set-password' });
  const [newPassword, setNewPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      tenantSession.client.post<{ ok: true }>(
        '/auth/password',
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
    <AuthCard
      title={t('auth.setPassword.title')}
      subtitle={t('auth.setPassword.subtitle')}
      footer={
        search.required ? null : (
          <button
            type="button"
            className="text-brand-700 hover:underline"
            onClick={() => {
              void navigate({ to: '/dashboard' });
            }}
          >
            {t('auth.setPassword.skip')}
          </button>
        )
      }
    >
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
