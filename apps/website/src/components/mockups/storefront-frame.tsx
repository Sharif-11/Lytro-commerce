import { Mark } from '@/components/ui/mark';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  cart: { bn: 'কার্ট · ২', en: 'Cart · 2' },
  banner: { bn: 'ঈদ কালেকশন', en: 'Eid collection' },
  bannerSub: {
    bn: 'ঢাকায় ৳2,000-এর বেশি অর্ডারে ফ্রি ডেলিভারি',
    en: 'Free delivery in Dhaka on orders over ৳2,000',
  },
  order: { bn: 'অর্ডার করুন · ঢাকায় ডেলিভারি ৳60', en: 'Order · delivery ৳60 to Dhaka' },
  secured: { bn: 'পেমেন্ট নিরাপদ · Secured by Lytro', en: 'Payment secured by Lytro' },
  powered: { bn: 'Powered by', en: 'Powered by' },
} satisfies Record<string, Bilingual>;

// The tenant's colour is plum on purpose: the storefront wears the seller's brand, not Lytro's
// (BRAND-IDENTITY.md §8.3). Only the "Powered by" mark is ours.
const plum = '#6b2d5c';

export function StorefrontFrame({ language }: { language: Language }) {
  const copy = new Copy(language);
  const products = [
    ['Jamdani saree', '৳4,200'],
    [language === 'bn' ? 'Kurti, M' : 'Kurti, M', '৳1,150'],
    ['Dupatta', '৳650'],
  ];
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-card border border-line bg-white shadow-lift"
    >
      <div className="flex items-center gap-2 border-b border-line bg-neutral-50 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
        <span className="num ml-2 min-w-0 flex-1 truncate rounded-md bg-white px-2 py-1 text-[11px] text-neutral-700">
          nishascloset.lytro.app
        </span>
      </div>
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: plum, color: '#fff' }}
      >
        <p className="text-[15px] font-bold">Nisha&apos;s Closet</p>
        <p className="text-[12px] font-semibold opacity-90">{copy.of(text.cart)}</p>
      </div>
      <div className="px-4 pt-3">
        <div className="rounded-xl px-4 py-4" style={{ background: '#f5e9f1' }}>
          <p className="text-[16px] font-bold" style={{ color: plum }}>
            {copy.of(text.banner)}
          </p>
          <p className="mt-1 text-[12px] text-neutral-700">{copy.of(text.bannerSub)}</p>
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {products.map(([name, price]) => (
            <li key={name} className="rounded-xl border border-line p-2">
              <div
                className="h-14 rounded-lg"
                style={{ background: 'linear-gradient(135deg,#f5e9f1,#e2c3d8)' }}
              />
              <p className="mt-1.5 truncate text-[11px] font-semibold text-ink">{name}</p>
              <p className="num text-[12px] font-bold" style={{ color: plum }}>
                {price}
              </p>
            </li>
          ))}
        </ul>
        <div
          className="mt-3 rounded-control py-2.5 text-center text-[13px] font-bold text-white"
          style={{ background: plum }}
        >
          {copy.of(text.order)}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-line px-4 py-2.5 text-[11px] text-neutral-700">
        <span>{copy.of(text.secured)}</span>
        <span className="inline-flex items-center gap-1 font-semibold">
          {copy.of(text.powered)} <Mark size={14} color="#0e6b66" />
          <span className="wordmark-text text-ink">ytro</span>
        </span>
      </div>
    </div>
  );
}
