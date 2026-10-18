import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  today: { bn: 'আজ', en: 'Today' },
  sales: { bn: 'বিক্রি', en: 'Sales' },
  newOrders: { bn: 'নতুন অর্ডার', en: 'New orders' },
  toConfirm: { bn: 'কনফার্ম বাকি', en: 'To confirm' },
  orders: { bn: 'অর্ডার', en: 'Orders' },
  seeAll: { bn: 'সব দেখুন', en: 'See all' },
  pending: { bn: 'পেন্ডিং', en: 'Pending' },
  paidBkash: { bn: 'মিরপুর, ঢাকা · বিকাশে পেইড', en: 'Mirpur, Dhaka · paid by bKash' },
  confirm: { bn: 'কনফার্ম', en: 'Confirm' },
  book: { bn: 'কুরিয়ার বুক', en: 'Book courier' },
  risk: { bn: 'ফেক সন্দেহ', en: 'Risk' },
  returns: { bn: 'এই নম্বরে ৩টি রিটার্ন', en: '3 returns on this number' },
  shipped: { bn: 'পাঠানো হয়েছে', en: 'Shipped' },
  delivered: { bn: 'ডেলিভারড', en: 'Delivered' },
  products: { bn: 'প্রোডাক্ট', en: 'Products' },
  customers: { bn: 'কাস্টমার', en: 'Customers' },
  balance: { bn: 'ব্যালেন্স', en: 'Balance' },
} satisfies Record<string, Bilingual>;

const statusTone = {
  pending: 'bg-accent-100 text-accent-700',
  risk: 'bg-danger-soft text-danger',
  shipped: 'bg-brand-100 text-brand-800',
  delivered: 'bg-success-soft text-success',
} as const;

/** The hero's phone: the dashboard home drawn in JSX from the real screens, never a screenshot
    (LANDING-PAGE-DESIGN.md §3 row 2). Figures are illustrative and marked so by the shop name. */
export function PhoneDashboard({ language }: { language: Language }) {
  const copy = new Copy(language);
  const orders = [
    {
      id: '#1042',
      who: 'Karim',
      status: copy.of(text.pending),
      tone: statusTone.pending,
      line: 'Galaxy Buds FE × 1',
      amount: '৳3,490',
      sub: copy.of(text.paidBkash),
      actions: true,
    },
    {
      id: '#1041',
      who: 'Shanta',
      status: copy.of(text.risk),
      tone: statusTone.risk,
      line: copy.of(text.returns),
      amount: '৳1,250',
      sub: null,
      actions: false,
    },
    {
      id: '#1040',
      who: 'Tanvir',
      status: copy.of(text.shipped),
      tone: statusTone.shipped,
      line: 'Steadfast · 6F2K91',
      amount: '৳2,100',
      sub: null,
      actions: false,
    },
    {
      id: '#1039',
      who: 'Nusrat',
      status: copy.of(text.delivered),
      tone: statusTone.delivered,
      line: 'Anker 20W × 2',
      amount: '৳1,780',
      sub: null,
      actions: false,
    },
  ];

  return (
    <div
      aria-hidden="true"
      className="w-[280px] rounded-[40px] border-[6px] border-brand-950 bg-brand-950 shadow-lift sm:w-[300px]"
    >
      <div className="overflow-hidden rounded-[34px] bg-neutral-50">
        <div className="flex items-center justify-between bg-white px-5 pt-3 pb-1 text-[11px] font-semibold text-ink">
          <span className="num">9:41</span>
          <span className="mx-auto h-5 w-20 rounded-full bg-brand-950" />
          <span className="num">4G ▮</span>
        </div>
        <div className="flex items-center gap-2.5 bg-white px-4 py-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-[13px] font-bold text-white">
            R
          </span>
          <div className="leading-tight">
            <p className="text-[13px] font-bold text-ink">Rahim Gadgets</p>
            <p className="text-[11px] text-neutral-700">{copy.of(text.today)}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 px-3 pt-2">
          <div className="col-span-3 rounded-xl bg-brand-700 px-3 py-2.5 text-white">
            <p className="num text-[20px] font-bold leading-none">৳18,420</p>
            <p className="mt-1 text-[11px] text-white/85">{copy.of(text.sales)}</p>
          </div>
          <div className="rounded-xl bg-white px-2.5 py-2 shadow-card">
            <p className="num text-[16px] font-bold text-ink">7</p>
            <p className="text-[10px] text-neutral-700">{copy.of(text.newOrders)}</p>
          </div>
          <div className="col-span-2 rounded-xl bg-white px-2.5 py-2 shadow-card">
            <p className="num text-[16px] font-bold text-ink">3</p>
            <p className="text-[10px] text-neutral-700">{copy.of(text.toConfirm)}</p>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
          <p className="text-[12px] font-bold text-ink">{copy.of(text.orders)}</p>
          <p className="text-[11px] font-semibold text-brand-700">{copy.of(text.seeAll)}</p>
        </div>
        <ul className="space-y-1.5 px-3 pb-2">
          {orders.map((order) => (
            <li key={order.id} className="rounded-xl bg-white px-3 py-2 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <p className="num text-[11px] font-semibold text-ink">
                  {order.id} · {order.who}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${order.tone}`}>
                  {order.status}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-neutral-700">
                <span className="truncate">{order.line}</span>
                <span className="num font-semibold text-ink">{order.amount}</span>
              </div>
              {order.sub ? (
                <p className="mt-0.5 text-[10px] text-neutral-700">{order.sub}</p>
              ) : null}
              {order.actions ? (
                <div className="mt-1.5 flex gap-1.5">
                  <span className="rounded-md bg-brand-700 px-2 py-1 text-[10px] font-bold text-white">
                    {copy.of(text.confirm)}
                  </span>
                  <span className="rounded-md border border-neutral-200 px-2 py-1 text-[10px] font-bold text-ink">
                    {copy.of(text.book)}
                  </span>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-4 border-t border-line bg-white px-2 pt-2 pb-4 text-center text-[10px] font-semibold text-neutral-700">
          <span className="text-brand-700">{copy.of(text.orders)}</span>
          <span>{copy.of(text.products)}</span>
          <span>{copy.of(text.customers)}</span>
          <span>{copy.of(text.balance)}</span>
        </div>
      </div>
    </div>
  );
}
