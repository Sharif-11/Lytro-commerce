import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { Mark } from '@/components/ui/mark';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  title: {
    bn: 'আজই দোকান খুলুন। বিক্রি হলে তবেই ফি।',
    en: 'Open your shop today. Pay when you sell.',
  },
  lead: {
    bn: 'তিন মিনিট, একটা ফোন নম্বর, কার্ড লাগবে না।',
    en: 'Three minutes, a phone number, no card.',
  },
  cta: { bn: 'ফ্রি দোকান খুলুন', en: 'Open a free shop' },
  secondary: { bn: 'প্রাইসিং দেখুন', en: 'See pricing' },
} satisfies Record<string, Bilingual>;

export function FinalCta({
  language,
  signInUrl,
  secondaryHref = '#pricing',
  secondaryLabel,
}: {
  language: Language;
  signInUrl: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  const copy = new Copy(language);
  return (
    <section id="final-cta" className="relative overflow-hidden bg-brand-900 text-white">
      <div className="dot-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <Container className="relative flex flex-col items-center py-16 text-center sm:py-20">
        <Mark size={44} color="#f8cf6e" />
        <h2 className="display mt-5 max-w-[720px] text-[28px] text-white sm:text-[38px]">
          {copy.of(text.title)}
        </h2>
        <p className="mt-3 text-[17px] text-white/85">{copy.of(text.lead)}</p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <ButtonLink href={signInUrl} tone="accent" size="lg">
            {copy.of(text.cta)}
          </ButtonLink>
          <ButtonLink href={secondaryHref} tone="light-outline" size="lg">
            {secondaryLabel ?? copy.of(text.secondary)}
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
