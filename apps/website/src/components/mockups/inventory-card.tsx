import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  stock: { bn: 'স্টক', en: 'Stock' },
  low: { bn: '৪টি কম', en: '4 low' },
  serial: { bn: 'সিরিয়াল ট্র্যাকড · ২টা আসছে', en: 'Serial tracked · 2 incoming' },
  ok: { bn: 'ঠিক আছে', en: 'OK' },
  sold: { bn: 'এই সপ্তাহে ১৪টা বিক্রি', en: 'Sold 14 this week' },
  lowOne: { bn: 'কম', en: 'Low' },
  kurti: { bn: 'Kurti · L · মেরুন', en: 'Kurti · L · Maroon' },
  batch: { bn: 'ব্যাচ B2 · মেয়াদ ১২ নভে', en: 'Batch B2 · expires 12 Nov' },
  out: { bn: 'শেষ', en: 'Out' },
  add: { bn: '+ স্টক যোগ করুন', en: '+ Add stock' },
} satisfies Record<string, Bilingual>;

/** The inventory spotlight's vignette: three stock rows with their state (INV-01 to INV-24). */
export function InventoryCard({ language }: { language: Language }) {
  const copy = new Copy(language);
  const rows = [
    {
      name: 'Galaxy Buds FE',
      sub: copy.of(text.serial),
      qty: '6',
      state: copy.of(text.ok),
      tone: 'bg-success-soft text-success',
    },
    {
      name: 'Anker 20W',
      sub: copy.of(text.sold),
      qty: '2',
      state: copy.of(text.lowOne),
      tone: 'bg-accent-100 text-accent-700',
    },
    {
      name: copy.of(text.kurti),
      sub: copy.of(text.batch),
      qty: '0',
      state: copy.of(text.out),
      tone: 'bg-danger-soft text-danger',
    },
  ];
  return (
    <div aria-hidden="true" className="rounded-card border border-line bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-bold text-ink">{copy.of(text.stock)}</p>
        <span className="rounded-full bg-accent-100 px-2.5 py-0.5 text-[12px] font-bold text-accent-700">
          {copy.of(text.low)}
        </span>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-ink">{row.name}</p>
              <p className="truncate text-[12px] text-neutral-700">{row.sub}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="num text-[16px] font-bold text-ink">{row.qty}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${row.tone}`}>
                {row.state}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 rounded-control bg-brand-700 py-2.5 text-center text-[14px] font-bold text-white">
        {copy.of(text.add)}
      </div>
    </div>
  );
}
