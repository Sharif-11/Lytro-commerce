import { Faq } from '@/components/landing/faq';
import { Features } from '@/components/landing/features';
import { FinalCta } from '@/components/landing/final-cta';
import { Hero } from '@/components/landing/hero';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Integrations } from '@/components/landing/integrations';
import { Pricing } from '@/components/landing/pricing';
import { Problems } from '@/components/landing/problems';
import { Proof } from '@/components/landing/proof';
import { Showcase } from '@/components/landing/showcase';
import { WhyLytro } from '@/components/landing/why-lytro';
import { ZeroRisk } from '@/components/landing/zero-risk';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteNav } from '@/components/layout/site-nav';
import { StickyCta } from '@/components/layout/sticky-cta';
import { PlansApi } from '@/lib/api/plans-api';
import { ServerApi } from '@/lib/api/server-api';
import { SiteEnvironment } from '@/lib/env';
import { LiveFeatures } from '@/lib/features';
import { Copy } from '@/lib/i18n/copy';
import { requestLanguage } from '@/lib/i18n/read-language';
import { AppUrls } from '@/lib/urls';

// The page reads the visitor's language cookie and the live plan catalogue on every request; the catalogue
// fetch itself is cached for a minute (ServerApi), so a pricing change shows within that time.
export const dynamic = 'force-dynamic';

const sticky = {
  title: { bn: 'ফ্রি দোকান খুলুন', en: 'Open a free shop' },
  subtitle: { bn: 'কার্ড নেই, মাসিক ফি নেই', en: 'No card, no monthly fee' },
  action: { bn: 'শুরু করুন', en: 'Start' },
};

export default async function LandingPage() {
  const language = await requestLanguage.read();
  const env = SiteEnvironment.current();
  const urls = new AppUrls(env.appUrl);
  const live = new LiveFeatures(env.liveFeatures);
  const copy = new Copy(language);
  const platformDomain = new URL(env.siteUrl).hostname;

  const api = new ServerApi({
    baseUrl: env.serverUrl,
    edgeSecret: env.edgeSecret,
    timeoutMs: 5000,
    revalidateSeconds: 60,
  });
  const catalogue = await new PlansApi(api).catalogue();

  return (
    <>
      <SiteNav language={language} />
      <main>
        <Hero
          language={language}
          signInUrl={urls.signIn()}
          platformDomain={platformDomain}
          showcaseLive={live.has('showcase')}
        />
        <Integrations language={language} />
        <Problems language={language} />
        <Features language={language} live={live} />
        <WhyLytro language={language} />
        {live.has('showcase') ? <Showcase language={language} /> : null}
        <HowItWorks language={language} />
        <Pricing language={language} catalogue={catalogue} urls={urls} />
        <Proof language={language} />
        <ZeroRisk language={language} />
        <Faq language={language} />
        <FinalCta language={language} signInUrl={urls.signIn()} />
      </main>
      <SiteFooter language={language} />
      <StickyCta
        href={urls.signIn()}
        title={copy.of(sticky.title)}
        subtitle={copy.of(sticky.subtitle)}
        action={copy.of(sticky.action)}
      />
    </>
  );
}
