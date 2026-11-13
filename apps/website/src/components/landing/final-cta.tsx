import { Mark } from '@/components/ui/mark';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  title: {
    bn: 'আজই দোকান খুলুন। অর্ডার পাঠালে তবেই ফি।',
    en: 'Open your shop today. Pay when you ship.',
  },
  lead: {
    bn: 'তিন মিনিট, একটা ফোন নম্বর, কার্ড লাগবে না।',
    en: 'Three minutes, a phone number, no card.',
  },
  cta: { bn: 'ফ্রি দোকান খুলুন', en: 'Open a free shop' },
  secondary: { bn: 'প্রাইসিং দেখুন', en: 'See pricing' },
} satisfies Record<string, Bilingual>;

/** The sketch's closing band, shared by the landing and the about page: the mark drawing itself in, the line, and the
    marigold button with a quiet second one. `id="final-cta"` is where the start bar hides. */
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
    <section className="final" id="final-cta">
      <div className="glow" aria-hidden="true" />
      <div className="wrap">
        <Mark size={56} draw className="markbig" />
        <h2>{copy.of(text.title)}</h2>
        <p>{copy.of(text.lead)}</p>
        <div className="acts">
          <a href={signInUrl} className="btn btn-accent">
            {copy.of(text.cta)}
          </a>
          <a href={secondaryHref} className="btn btn-ghost">
            {secondaryLabel ?? copy.of(text.secondary)}
          </a>
        </div>
      </div>
    </section>
  );
}
