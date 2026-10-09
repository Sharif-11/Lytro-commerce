import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/button';
import { ErrorBanner } from '@/components/error-banner';
import { errorMessage } from '@/api/error-message';
import { tenantSession } from '@/session/tenant-session';

// Proves this auth slice's routing and session end to end with real /me data and a working sign-out. The
// real dashboard shell (nav, full branding, language toggle) is the next slice, not this one.
export function DashboardPlaceholder(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => tenantSession.refreshMe(),
  });

  const signOut = useMutation({
    mutationFn: () => tenantSession.client.post<{ ok: true }>('/auth/signout'),
    // Clear local state and leave either way — a failed signout call shouldn't trap the tenant on a screen
    // they explicitly asked to leave.
    onSettled: () => {
      tenantSession.clear();
      void navigate({ to: '/sign-in' });
    },
  });

  const tenant = me.data?.tenant ?? null;

  return (
    <AuthCard
      title={tenant?.shopName ?? t('dashboard.placeholder.title')}
      subtitle={t('dashboard.placeholder.subtitle')}
      footer={
        <Button
          variant="ghost"
          loading={signOut.isPending}
          onClick={() => {
            signOut.mutate();
          }}
        >
          {t('dashboard.logout')}
        </Button>
      }
    >
      {me.isLoading ? (
        <p className="text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}
      {me.isError ? <ErrorBanner message={errorMessage(me.error, t)} /> : null}
      {me.data ? (
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
            <dt className="text-slate-500">{t('dashboard.fields.subscriberId')}</dt>
            <dd className="truncate font-medium text-slate-900">{me.data.subscriber.id}</dd>
          </div>
          {tenant ? (
            <>
              <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
                <dt className="text-slate-500">{t('dashboard.fields.shopUrl')}</dt>
                <dd className="truncate font-medium text-slate-900">{tenant.slug}.lytro.com</dd>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
                <dt className="text-slate-500">{t('dashboard.fields.state')}</dt>
                <dd className="font-medium text-slate-900 capitalize">{tenant.state}</dd>
              </div>
              {tenant.planName ? (
                <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
                  <dt className="text-slate-500">{t('dashboard.fields.plan')}</dt>
                  <dd className="font-medium text-slate-900">{tenant.planName}</dd>
                </div>
              ) : null}
            </>
          ) : null}
        </dl>
      ) : null}
    </AuthCard>
  );
}
