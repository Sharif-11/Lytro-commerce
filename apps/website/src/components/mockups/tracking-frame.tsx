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

/** The public tracking page a customer opens from the shipping SMS (TRK-01), in a browser frame (site.css `.track`). */
export function TrackingFrame({ language }: { language: Language }) {
  const copy = new Copy(language);
  const steps = [
    { label: copy.of(text.placed), state: 'done' },
    { label: copy.of(text.confirmed), state: 'done' },
    { label: copy.of(text.withCourier), state: 'now' },
    { label: copy.of(text.delivered), state: undefined },
  ];
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
          lytro.app/t/6f2k91
        </span>
      </div>
      <div className="track" aria-hidden="true">
        <div className="top">
          <b>#1040 · Rahim Gadgets</b>
          <span className="chip ship">{copy.of(text.shipped)}</span>
        </div>
        <div className="steps">
          {steps.map((step) => (
            <div key={step.label} className={step.state}>
              {step.label}
            </div>
          ))}
        </div>
        <div className="sms">
          <Icon name="sms" size={16} />
          <span>{copy.of(text.sms)}</span>
        </div>
      </div>
    </>
  );
}
