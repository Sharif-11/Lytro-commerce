import { Icon } from '@/components/ui/icon';
import { Wordmark } from '@/components/ui/wordmark';
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

// The tenant's colour is plum on purpose (site.css `.store`): the storefront wears the seller's brand, not Lytro's
// (BRAND-IDENTITY.md §8.3). Only the "Powered by" mark is ours.
const products = [
  { name: 'Jamdani saree', price: '৳4,200', wide: false },
  { name: 'Kurti, M', price: '৳1,150', wide: false },
  { name: 'Dupatta', price: '৳650', wide: true },
];

/** A seller's storefront in a browser frame (site.css `.bar2`, `.store`); the third product joins from 900 px. */
export function StorefrontFrame({ language }: { language: Language }) {
  const copy = new Copy(language);
  return (
    <>
      <div className="bar2" aria-hidden="true">
        <span className="dots">
          <i />
          <i />
          <i />
        </span>
        <span className="url">
          <Icon name="lock" size={13} />
          nishascloset.lytro.app
        </span>
      </div>
      <div className="store" aria-hidden="true">
        <div className="hd">
          <b>
            <i />
            Nisha&apos;s Closet
          </b>
          <span>{copy.of(text.cart)}</span>
        </div>
        <div className="hero2">
          {copy.of(text.banner)}
          <small>{copy.of(text.bannerSub)}</small>
        </div>
        <div className="grid">
          {products.map((product) => (
            <div key={product.name} className={product.wide ? 'p x3' : 'p'}>
              <i />
              <div>
                <b>{product.name}</b>
                <span className="num">{product.price}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="buy">{copy.of(text.order)}</div>
        <div className="foot">
          <span>{copy.of(text.secured)}</span>
          <span className="pb">
            {copy.of(text.powered)}
            <span className="wm">
              <Wordmark height={22} tone="css" />
            </span>
          </span>
        </div>
      </div>
    </>
  );
}
