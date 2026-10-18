import { Icon } from '@/components/ui/icon';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  shipped: { bn: 'পাঠানো হয়েছে', en: 'Shipped' },
  placed: { bn: 'অর্ডার হয়েছে · মঙ্গল দুপুর ২:১০', en: 'Order placed · Tue 2:10 PM' },
  confirmed: { bn: 'কনফার্মড · মঙ্গল দুপুর ২:৩৫', en: 'Confirmed · Tue 2:35 PM' },
  withCourier: { bn: 'Steadfast-এর কাছে · 6F2K91', en: 'With Steadfast · 6F2K91' },
  delivered: { bn: 'ডেলিভারড', en: 'Delivered' },
  sms: {
    bn: 'Rahim Gadgets: অর্ডার #1040 পাঠানো হয়েছে। ট্র্যাক: lytro.app/t/6f2k91',
    en: 'Rahim Gadgets: order #1040 shipped. Track: lytro.app/t/6f2k91',
  },
} satisfies Record<string, Bilingual>;

/** The public tracking page a customer opens from the shipping SMS (TRK-01). */
export function TrackingFrame({ language }: { language: Language }) {
  const copy = new Copy(language);
  const steps = [
    { label: copy.of(text.placed), done: true },
    { label: copy.of(text.confirmed), done: true },
    { label: copy.of(text.withCourier), done: true, current: true },
    { label: copy.of(text.delivered), done: false },
  ];
  return (
    <div aria-hidden="true" className="space-y-3">
      <div className="overflow-hidden rounded-card border border-line bg-white shadow-lift">
        <div className="flex items-center gap-2 border-b border-line bg-neutral-50 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
          <span className="num ml-2 min-w-0 flex-1 truncate rounded-md bg-white px-2 py-1 text-[11px] text-neutral-700">
            lytro.app/t/6f2k91
          </span>
        </div>
        <div className="px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <p className="num text-[14px] font-bold text-ink">#1040 · Rahim Gadgets</p>
            <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-bold text-brand-800">
              {copy.of(text.shipped)}
            </span>
          </div>
          <ol className="mt-4 space-y-3">
            {steps.map((step) => (
              <li key={step.label} className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full ${
                    step.done
                      ? step.current
                        ? 'bg-brand-700 text-white'
                        : 'bg-success-soft text-success'
                      : 'border border-neutral-200 bg-white'
                  }`}
                >
                  {step.done ? (
                    <Icon name={step.current ? 'truck' : 'check'} size={14} strokeWidth={2.5} />
                  ) : null}
                </span>
                <span
                  className={`text-[13px] ${step.done ? 'font-semibold text-ink' : 'text-neutral-700'}`}
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="flex items-start gap-2.5 rounded-card border border-line bg-white px-3.5 py-3 text-[12px] text-neutral-700 shadow-card">
        <Icon name="sms" size={18} className="mt-0.5 text-brand-700" />
        <p className="num">{copy.of(text.sms)}</p>
      </div>
    </div>
  );
}
