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
const heights = [38, 52, 46, 70, 64, 86];

/** The statistics spotlight's picture (site.css `.mock`): six months of sales, this month's figures, and from 640 px
    the top products (STA-01 to STA-04). */
export function StatsCard({ language }: { language: Language }) {
  const copy = new Copy(language);
  const kpis = [
    ['৳2,14,600', copy.of(text.thisMonth)],
    ['312', copy.of(text.orders)],
    ['৳688', copy.of(text.avg)],
  ];
  const top = [
    ['Galaxy Buds FE', '৳48,860'],
    ['Anker 20W', '৳31,240'],
    ['Redmi Buds 6', '৳22,900'],
  ];
  return (
    <div className="mock" aria-hidden="true">
      <div className="hd">
        <span className="t">{copy.of(text.title)}</span>
        <span>{copy.of(text.monthly)}</span>
      </div>
      <div className="chart">
        {heights.map((height, index) => (
          <i
            key={months[index]}
            className={index === heights.length - 1 ? 'now' : undefined}
            style={{ height: `${String(height)}%` }}
          >
            <span>{months[index]}</span>
          </i>
        ))}
      </div>
      <div className="kpis">
        {kpis.map(([value, label]) => (
          <div key={label}>
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="top">
        {top.map(([name, amount], index) => (
          <div key={name}>
            <span>
              {copy.count(index + 1)}. {name}
            </span>
            <b>{amount}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
