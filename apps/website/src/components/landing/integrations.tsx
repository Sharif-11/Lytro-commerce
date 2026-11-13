import Image from 'next/image';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';
import { liveServices } from '@/lib/services';

const text = {
  title: {
    bn: 'যেগুলো আপনি এখনই ব্যবহার করেন, সেগুলোর সাথেই কাজ করে',
    en: 'Works with the services you already use',
  },
  more: { bn: 'আরও আসছে', en: 'more coming' },
} satisfies Record<string, Bilingual>;

/** The sketch's strip under the hero's curve: the live services' marks on white tiles, wrapping onto a second row on
    a phone and never scrolling (LANDING-PAGE-DESIGN.md §4). */
export function Integrations({ language }: { language: Language }) {
  const copy = new Copy(language);
  return (
    <section className="strip" aria-labelledby="integrations-title">
      <div className="wrap">
        <p id="integrations-title" className="lbl">
          {copy.of(text.title)}
        </p>
        <ul className="row">
          {liveServices.map((service) => (
            <li key={service.name} className="logo">
              <Image
                src={service.src}
                alt={service.name}
                width={service.width}
                height={service.height}
                style={{ width: 'auto' }}
              />
            </li>
          ))}
          <li className="more">{copy.of(text.more)}</li>
        </ul>
      </div>
    </section>
  );
}
