import { LIMIT_WHEN_UNSET, PAYG_API_CAP_MAX } from '@lytronix/validators';
import { DOC_BASE } from '@lytronix/validators/developer-api';
import { DeveloperDocs, type PlanRow } from '@/components/developers/developer-docs';
import { WORDS } from '@/components/developers/words';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteNav } from '@/components/layout/site-nav';
import { buttonClass } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { PlansApi } from '@/lib/api/plans-api';
import { ServerApi } from '@/lib/api/server-api';
import { SiteEnvironment } from '@/lib/env';
import { requestLanguage } from '@/lib/i18n/read-language';
import { pageMetadata } from '@/lib/seo/site-pages';
import { AppUrls } from '@/lib/urls';

export const metadata = pageMetadata('developers');

// The plans' figures are read live, cached for a minute (ServerApi), like the pricing section's.
export const dynamic = 'force-dynamic';

const number = (value: number): string => value.toLocaleString('en-US');

/**
 * lytro.app/developers (SITE-PAGES-DESIGN §7, the site sketch's `#developers`): the public copy of the dashboard's
 * Developer API docs, from the same definition (@lytronix/validators/developer-api), for a developer reading before
 * the seller has a shop or a key. The plans' requests a cycle are live; while pay-as-you-go fair use is on, its row is
 * its charge (the 2026-11-25 amendment).
 */
export default async function DevelopersPage() {
  const language = await requestLanguage.read();
  const env = SiteEnvironment.current();
  const urls = new AppUrls(env.appUrl);
  const pick = (pair: readonly [string, string]): string => (language === 'bn' ? pair[0] : pair[1]);
  const plansApi = new PlansApi(
    new ServerApi({
      baseUrl: env.serverUrl,
      edgeSecret: env.edgeSecret,
      timeoutMs: 5000,
      revalidateSeconds: 60,
    }),
  );
  const [catalogue, paygPlan, charge] = await Promise.all([
    plansApi.catalogue(),
    plansApi.payAsYouGo(),
    plansApi.paygApiCharge(),
  ]);
  const payg =
    charge?.on && charge.perThousand !== null
      ? {
          free: number(charge.freeRequests),
          rate: Number(charge.perThousand).toLocaleString('en-US', { maximumFractionDigits: 2 }),
          max: number(PAYG_API_CAP_MAX),
        }
      : null;
  const plans: PlanRow[] = [
    { name: ['ট্রায়াল', 'Trial'], figure: number(LIMIT_WHEN_UNSET.requests_monthly ?? 0) },
    {
      name: ['পে-অ্যাজ-ইউ-গো', 'Pay-as-you-go'],
      figure: payg
        ? pick(WORDS.paygRow).replace('{free}', payg.free).replace('{rate}', payg.rate)
        : number(paygPlan?.limits.requests_monthly ?? 0),
    },
    ...(catalogue?.plans ?? []).map((plan): PlanRow => ({
      name: [plan.name, plan.name],
      figure: number(plan.limits.requests_monthly ?? 0),
    })),
  ];

  return (
    <>
      <SiteNav language={language} />
      <main className="dv-page">
        <section className="relative overflow-hidden bg-brand-900 text-white">
          <div className="dot-grid pointer-events-none absolute inset-0" aria-hidden="true" />
          <Container className="dv-hero relative py-14 sm:py-16">
            <p className="m-0 text-[14px] text-brand-100">
              lytro.app / <b className="text-white">{pick(WORDS.crumb)}</b>
            </p>
            <h1 className="mt-4 text-[clamp(1.9rem,1.3rem+3vw,3rem)] leading-[1.22] font-extrabold">
              {language === 'bn' ? (
                <>
                  Lytro API: নিজের ওয়েবসাইটে <em>আপনার শপ</em>
                </>
              ) : (
                <>
                  The Lytro API: <em>your shop</em> on your own website
                </>
              )}
            </h1>
            <p className="mt-4 max-w-[640px] text-[17px] text-[#eef9f7]">{pick(WORDS.heroLead)}</p>
            <div className="dv-base">
              <span>{pick(WORDS.baseUrl)}</span>
              <code>{DOC_BASE}</code>
              <span className="dv-ver">v1</span>
            </div>
            <div className="acts">
              <a href={urls.signIn()} className={buttonClass('accent', 'lg')}>
                {pick(WORDS.openShop)}
              </a>
              <a href={urls.signIn()} className={buttonClass('light-outline', 'lg')}>
                {pick(WORDS.loginForKey)}
              </a>
            </div>
          </Container>
        </section>
        <div className="dv-body">
          <Container>
            <DeveloperDocs
              language={language}
              plans={plans}
              payg={payg}
              signUpUrl={urls.signIn()}
              signInUrl={urls.signIn()}
            />
          </Container>
        </div>
      </main>
      <SiteFooter language={language} />
    </>
  );
}
