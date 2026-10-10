import { Nav } from '@/components/nav';
import { Hero } from '@/components/hero';
import { Solutions } from '@/components/solutions';
import { HowItWorks } from '@/components/how-it-works';
import { Pricing } from '@/components/pricing';
import { Faq } from '@/components/faq';
import { FinalCta } from '@/components/final-cta';
import { Footer } from '@/components/footer';

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
