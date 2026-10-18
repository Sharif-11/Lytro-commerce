import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  title: { bn: 'বিক্রি, শেষ ৬ মাস', en: 'Sales, last 6 months' },
  monthly: { bn: 'মাসিক', en: 'Monthly' },
  thisMonth: { bn: 'এই মাসে', en: 'This month' },
  orders: { bn: 'অর্ডার', en: 'Orders' },
  avg: { bn: 'গড় অর্ডার', en: 'Avg order' },
} satisfies Record<string, Bilingual>;

const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
const heights = [38, 46, 42, 60, 72, 88];

/** The statistics spotlight's vignette: a six-month bar chart and the top products (STA-01 to STA-04). */
export function StatsCard({ language }: { language: Language }) {
  const copy = new Copy(language);
  const top = [
    ['Galaxy Buds FE', '৳48,860'],
    ['Anker 20W', '৳31,240'],
    ['Redmi Buds 6', '৳22,900'],
  ];
  return (
    <div aria-hidden="true" className="rounded-card border border-line bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-bold text-ink">{copy.of(text.title)}</p>
        <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[12px] font-semibold text-neutral-700">
          {copy.of(text.monthly)}
        </span>
      </div>
      <div className="mt-3 flex h-24 items-end gap-2">
        {heights.map((height, index) => (
          <div key={months[index]} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-t-md ${index === heights.length - 1 ? 'bg-brand-700' : 'bg-brand-200'}`}
              style={{ height: `${String(height)}%` }}
            />
            <span className="num text-[10px] text-neutral-700">{months[index]}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ['৳2,14,600', copy.of(text.thisMonth)],
          ['312', copy.of(text.orders)],
          ['৳688', copy.of(text.avg)],
        ].map(([value, label]) => (
          <div key={label} className="rounded-lg bg-neutral-50 px-2 py-2">
            <p className="num text-[15px] font-bold text-ink">{value}</p>
            <p className="text-[11px] text-neutral-700">{label}</p>
          </div>
        ))}
      </div>
      <ol className="mt-3 space-y-1.5">
        {top.map(([name, amount], index) => (
          <li key={name} className="flex items-center justify-between text-[13px]">
            <span className="text-ink">
              {copy.count(index + 1)}. {name}
            </span>
            <span className="num font-semibold text-ink">{amount}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
