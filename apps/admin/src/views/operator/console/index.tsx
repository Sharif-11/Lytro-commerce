import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/button';
import { operatorSession } from '@/session/operator-session';

/** The honest landing after a successful operator sign-in: the real console (ADM-02 to ADM-17) isn't built
    yet (D30's own note) — this just confirms two-factor sign-in worked and gives a way back out, rather than
    a dead end or a fake dashboard. */
export function OperatorConsole(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const signOut = useMutation({
    mutationFn: () => operatorSession.client.post<{ ok: true }>('/auth/operator/signout'),
    onSettled: () => {
      operatorSession.clear();
      void navigate({ to: '/operator/sign-in' });
    },
  });

  return (
    <AuthCard title={t('operator.console.title')} subtitle={t('operator.console.subtitle')}>
      <Button
        type="button"
        variant="outline"
        loading={signOut.isPending}
        onClick={() => {
          signOut.mutate();
        }}
      >
        {t('operator.console.signOut')}
      </Button>
    </AuthCard>
  );
}
