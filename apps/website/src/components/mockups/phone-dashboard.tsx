import { Icon } from '@/components/ui/icon';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  shop: { bn: 'মেঘ ফ্যাশন', en: 'Megh Fashion' },
  today: { bn: 'আজ', en: 'Today' },
  sales: { bn: 'বিক্রি', en: 'Sales' },
  newOrders: { bn: 'নতুন অর্ডার', en: 'New orders' },
  toShip: { bn: 'শিপ করার', en: 'To ship' },
  matched: { bn: 'বিকাশ ৳4,200 মিলেছে', en: 'bKash ৳4,200 matched' },
  matchedSub: { bn: 'অর্ডার #1042, নিজে থেকেই', en: 'Order #1042, by itself' },
  todaysOrders: { bn: 'আজকের অর্ডার', en: "Today's orders" },
  seeAll: { bn: 'সব দেখুন', en: 'See all' },
  paid: { bn: 'পেইড', en: 'Paid' },
  confirm: { bn: 'কনফার্ম', en: 'Confirm' },
  book: { bn: 'কুরিয়ার বুক', en: 'Book courier' },
  risk: { bn: 'ফেক সন্দেহ', en: 'Risk' },
  returns: { bn: 'এই নম্বরে ৩টি রিটার্ন', en: '3 returns on this number' },
  shipped: { bn: 'পাঠানো হয়েছে', en: 'Shipped' },
  home: { bn: 'হোম', en: 'Home' },
  orders: { bn: 'অর্ডার', en: 'Orders' },
  shopTab: { bn: 'দোকান', en: 'Shop' },
  money: { bn: 'টাকা', en: 'Money' },
  menu: { bn: 'মেনু', en: 'Menu' },
} satisfies Record<string, Bilingual>;

/** The hero's one phone screen (LANDING-PAGE-DESIGN.md §3 row 2): today's figures, a bKash payment matched on its own,
    and today's orders with the actions a seller takes. A picture, so it is hidden from assistive technology. */
export function PhoneDashboard({ language }: { language: Language }) {
  const copy = new Copy(language);
  const tabs = [text.home, text.orders, text.shopTab, text.money, text.menu];
  return (
    <div className="shot" aria-hidden="true">
      <div className="phone">
        <div className="screen">
          <div className="status">
            <span>9:41</span>
            <span className="isl" />
            <span>4G</span>
          </div>
          <div className="bar">
            <div className="shop">
              <i>ম</i>
              <span>{copy.of(text.shop)}</span>
              <small>{copy.of(text.today)}</small>
            </div>
            <div className="stats">
              <div>
                <b>৳18,420</b>
                <span>{copy.of(text.sales)}</span>
              </div>
              <div>
                <b>7</b>
                <span>{copy.of(text.newOrders)}</span>
              </div>
              <div>
                <b>3</b>
                <span>{copy.of(text.toShip)}</span>
              </div>
            </div>
          </div>
          <div className="match">
            <span className="ico">
              <Icon name="wallet" size={18} />
            </span>
            <div>
              <b>{copy.of(text.matched)}</b>
              <small>{copy.of(text.matchedSub)}</small>
            </div>
          </div>
          <div className="sec-t">
            <span>{copy.of(text.todaysOrders)}</span>
            <span>{copy.of(text.seeAll)}</span>
          </div>
          <div className="list">
            <div className="o">
              <div className="r">
                <b>#1042 · Karim</b>
                <span className="chip ok">{copy.of(text.paid)}</span>
              </div>
              <div className="r">
                <span className="m">Jamdani saree × 1</span>
                <b>৳4,200</b>
              </div>
              <div className="act">
                <span className="a">{copy.of(text.confirm)}</span>
                <span className="p">{copy.of(text.book)}</span>
              </div>
            </div>
            <div className="o">
              <div className="r">
                <b>#1041 · Shanta</b>
                <span className="chip risk">{copy.of(text.risk)}</span>
              </div>
              <div className="r">
                <span className="m">{copy.of(text.returns)}</span>
                <b>৳1,250</b>
              </div>
            </div>
            <div className="o">
              <div className="r">
                <b>#1040 · Tanvir</b>
                <span className="chip ship">{copy.of(text.shipped)}</span>
              </div>
              <div className="r">
                <span className="m">Steadfast · 6F2K91</span>
                <b>৳2,100</b>
              </div>
            </div>
          </div>
          <div className="tabs">
            {tabs.map((tab, index) => (
              <div key={tab.en} className={index === 0 ? 'on' : undefined}>
                <i />
                <span>{copy.of(tab)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
