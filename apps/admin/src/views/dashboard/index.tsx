import { useTranslation } from 'react-i18next';
import { useMe } from '@/api/auth';
import { ErrorBanner } from '@/components/error-banner';
import { errorMessage } from '@/api/error-message';

// Branding, nav and sign-out now live in DashboardShell (the layout route wraps every screen in it) — this
// view is just its own content: the shop identity card. Real dashboard content (orders, products, ...) has
// no backend yet in Phase 1 (see D32's planning note); this stays modest on purpose.
export function DashboardHome(): React.JSX.Element {
  const { t } = useTranslation();
  const me = useMe();
  const tenant = me.data?.tenant ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-6 sm:py-8">
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
        {tenant?.shopName ?? t('dashboard.placeholder.title')}
      </h1>
      <p className="mt-1 text-sm text-slate-500">{t('dashboard.placeholder.subtitle')}</p>

      {me.isLoading ? (
        <p className="mt-6 text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}
      {me.isError ? (
        <div className="mt-6">
          <ErrorBanner message={errorMessage(me.error, t)} />
        </div>
      ) : null}
      {me.data ? (
        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3 shadow-sm">
            <dt className="text-slate-500">{t('dashboard.fields.subscriberId')}</dt>
            <dd className="truncate font-medium text-slate-900">{me.data.subscriber.id}</dd>
          </div>
          {tenant ? (
            <>
              <div className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3 shadow-sm">
                <dt className="text-slate-500">{t('dashboard.fields.shopUrl')}</dt>
                <dd className="truncate font-medium text-slate-900">{tenant.slug}.lytro.com</dd>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3 shadow-sm">
                <dt className="text-slate-500">{t('dashboard.fields.state')}</dt>
                <dd className="font-medium text-slate-900 capitalize">{tenant.state}</dd>
              </div>
              {tenant.planName ? (
                <div className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3 shadow-sm">
                  <dt className="text-slate-500">{t('dashboard.fields.plan')}</dt>
                  <dd className="font-medium text-slate-900">{tenant.planName}</dd>
                </div>
              ) : null}
            </>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
