import { useState, type SyntheticEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';
import { errorMessage } from '@/api/error-message';
import { isValidBdPhone } from '@/api/phone';
import { useStaffSignIn } from '@/api/auth';
import { LockIcon, PhoneIcon } from '@/components/icons';
import { SignInIllustration } from '@/components/illustrations';

/**
 * A separate screen from the owner's SignIn (AUTH-12), not a mode toggle on it — a staff member's sign-in is
 * phone + password only (no OTP, no OAuth: StaffAuthController never exposes those). useStaffSignIn
 * (api/auth) posts to its own `/auth/staff/signin` endpoint and handles its own next-step routing there,
 * since StaffSignedInBody's NextStep is narrower than the owner's (never create-shop or a billing state,
 * only a forced password change or the dashboard) — reusing navigateForNextStep would send 'set-password' to
 * the owner's /set-password screen, the wrong endpoint entirely (see staff-set-password's own note).
 */
export function StaffSignIn(): React.JSX.Element {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const signIn = useStaffSignIn();

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!isValidBdPhone(phone)) {
      setFormError(t('auth.signIn.invalidPhone'));
      return;
    }
    setFormError(null);
    signIn.mutate({ phone, password });
  }

  return (
    <AuthCard
      title={t('auth.staffSignIn.title')}
      subtitle={t('auth.staffSignIn.subtitle')}
      illustration={<SignInIllustration />}
      footer={
        <Link to="/sign-in" className="text-brand-700 hover:underline">
          {t('auth.staffSignIn.backToOwnerSignIn')}
        </Link>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <TextField
          label={t('auth.signIn.phoneLabel')}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={t('auth.signIn.phonePlaceholder')}
          icon={<PhoneIcon />}
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
          }}
          error={formError ?? undefined}
        />
        <TextField
          label={t('auth.signIn.passwordLabel')}
          name="password"
          type="password"
          autoComplete="current-password"
          icon={<LockIcon />}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
        {signIn.isError ? <ErrorBanner message={errorMessage(signIn.error, t)} /> : null}
        <Button type="submit" loading={signIn.isPending}>
          {t('auth.signIn.signInWithPassword')}
        </Button>
      </form>
    </AuthCard>
  );
}
