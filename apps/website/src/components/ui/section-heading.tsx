import type { ReactNode } from 'react';

/** Eyebrow, headline and lead that open every section of the landing page, in one of two tones. */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = 'center',
  tone = 'dark',
  as: Heading = 'h2',
}: {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  align?: 'center' | 'left';
  tone?: 'dark' | 'light';
  as?: 'h1' | 'h2';
}) {
  const alignment = align === 'center' ? 'mx-auto text-center' : 'text-left';
  const titleColour = tone === 'dark' ? 'text-ink' : 'text-white';
  const leadColour = tone === 'dark' ? 'text-neutral-700' : 'text-white/85';
  const eyebrowColour = tone === 'dark' ? 'text-brand-700' : 'text-brand-300';
  return (
    <div className={`max-w-[640px] ${alignment}`}>
      <p className={`text-xs font-bold uppercase tracking-[0.14em] ${eyebrowColour}`}>{eyebrow}</p>
      <Heading className={`heading mt-3 text-[26px] sm:text-[32px] lg:text-[38px] ${titleColour}`}>
        {title}
      </Heading>
      {lead ? <p className={`mt-4 text-[17px] ${leadColour}`}>{lead}</p> : null}
    </div>
  );
}
