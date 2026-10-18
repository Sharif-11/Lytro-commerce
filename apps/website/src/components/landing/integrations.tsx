import Image from 'next/image';
import { Container } from '@/components/ui/container';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  title: {
    bn: 'যেগুলো আপনি এখনই ব্যবহার করেন, সেগুলোর সাথেই কাজ করে',
    en: 'Works with the services you already use',
  },
  more: { bn: 'আরও আসছে', en: 'more coming' },
} satisfies Record<string, Bilingual>;

// Official marks only, each in its own colours on a white tile (BRAND-IDENTITY.md §8.7). Only services that
// are live appear; RedX joins when its integration ships (docs/brand/third-party/README.md).
const services = [
  { name: 'bKash', src: '/third-party/bkash.png', width: 96, height: 40 },
  { name: 'Nagad', src: '/third-party/nagad.png', width: 96, height: 40 },
  { name: 'Steadfast', src: '/third-party/steadfast.svg', width: 120, height: 36 },
  { name: 'Pathao', src: '/third-party/pathao.svg', width: 100, height: 36 },
];

/** The strip rotates on its own at every width (`.marquee` in globals.css). The second copy of the tiles
    exists only to make the loop seamless, so it is hidden from assistive technology. */
export function Integrations({ language }: { language: Language }) {
  const copy = new Copy(language);
  const tiles = (hidden: boolean) => (
    <ul className="flex shrink-0 gap-3 pr-3" aria-hidden={hidden || undefined}>
      {services.map((service) => (
        <li
          key={service.name}
          className="flex h-16 w-[150px] shrink-0 items-center justify-center rounded-card border border-line bg-white px-5 shadow-card"
        >
          <Image
            src={service.src}
            alt={hidden ? '' : service.name}
            width={service.width}
            height={service.height}
            className="h-9 w-auto max-w-[110px] object-contain"
          />
        </li>
      ))}
      <li className="flex h-16 shrink-0 items-center rounded-card border border-dashed border-neutral-200 px-5 text-[14px] font-semibold text-neutral-700">
        {copy.of(text.more)}
      </li>
    </ul>
  );

  return (
    <section aria-labelledby="integrations-title" className="border-b border-line bg-white">
      <Container className="py-8 sm:py-10">
        <h2
          id="integrations-title"
          className="text-center text-[14px] font-semibold text-neutral-700"
        >
          {copy.of(text.title)}
        </h2>
        <div className="marquee mt-5 -mx-4 sm:mx-0">
          <div className="marquee-track">
            {tiles(false)}
            {tiles(true)}
          </div>
        </div>
      </Container>
    </section>
  );
}
