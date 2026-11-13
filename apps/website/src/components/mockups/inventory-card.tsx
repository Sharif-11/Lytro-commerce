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

/** The inventory spotlight's picture (site.css `.mock`): three stock rows with their state (INV-01 to INV-24). */
export function InventoryCard({ language }: { language: Language }) {
  const copy = new Copy(language);
  const rows = [
    {
      name: 'Galaxy Buds FE',
      sub: copy.of(text.serial),
      qty: '6',
      state: copy.of(text.ok),
      tone: 'ok',
    },
    {
      name: 'Anker 20W',
      sub: copy.of(text.sold),
      qty: '2',
      state: copy.of(text.lowOne),
      tone: 'pending',
    },
    {
      name: copy.of(text.kurti),
      sub: copy.of(text.batch),
      qty: '0',
      state: copy.of(text.out),
      tone: 'risk',
    },
  ];
  return (
    <div className="mock" aria-hidden="true">
      <div className="hd">
        <span className="t">{copy.of(text.stock)}</span>
        <span>{copy.of(text.low)}</span>
      </div>
      <div className="inv">
        {rows.map((row) => (
          <div key={row.name} className="row">
            <div>
              <b>{row.name}</b>
              <small>{row.sub}</small>
            </div>
            <div className="qc">
              <span className="q">{row.qty}</span>
              <span className={`chip ${row.tone}`}>{row.state}</span>
            </div>
          </div>
        ))}
        <div className="add">{copy.of(text.add)}</div>
      </div>
    </div>
  );
}
