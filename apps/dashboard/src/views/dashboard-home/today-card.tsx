import { useTranslation } from 'react-i18next';

/** Today's figures, all zero on day one, with the empty state (ONBOARDING-FLOW-DESIGN §3). Orders have no
    backend yet, so the figures are the honest zeros of a new shop. */
export function TodayCard(): React.JSX.Element {
  const { t } = useTranslation();
  const figures = [
    { key: 'orders', value: '0' },
    { key: 'sales', value: '৳0' },
    { key: 'toConfirm', value: '0' },
  ];
  return (
    <section className="rounded-card border border-line bg-white p-4 shadow-card sm:p-5">
      <h2 className="text-[16px] font-bold text-ink">{t('home.today.title')}</h2>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {figures.map((figure) => (
          <div key={figure.key} className="rounded-control bg-neutral-50 px-3 py-2.5">
            <dd className="num text-[22px] font-bold text-ink">{figure.value}</dd>
            <dt className="text-[12px] text-neutral-700">{t(`home.today.${figure.key}`)}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[15px] text-neutral-700">{t('home.today.empty')}</p>
    </section>
  );
}
