import { Nav } from '@/components/nav';
import { Hero } from '@/components/hero';
import { Solutions } from '@/components/solutions';
import { HowItWorks } from '@/components/how-it-works';
import { Pricing } from '@/components/pricing';
import { Faq } from '@/components/faq';
import { FinalCta } from '@/components/final-cta';
import { Footer } from '@/components/footer';

// D2-12: Pricing reads live plan/term/price data, which `next build`'s static-generation step cannot do --
// there's nothing listening on a reachable API at build time (no API_URL, no server), so trying to
// prerender this page statically either bakes in empty pricing forever or, as happened in CI, hangs the
// fetch until the build's own page-generation timeout kills it. Forcing this route dynamic means it's never
// prerendered at build time at all, only rendered per-request once something real is actually listening.
export const dynamic = 'force-dynamic';

export default function HomePage(): React.JSX.Element {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Solutions />
        <HowItWorks />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
