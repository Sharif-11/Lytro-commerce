import { adminUrl } from '@/lib/admin-url';

/** The positioning statement from docs/MARKETING-PLAN.md §3, as the headline — "the fastest, simplest way
    for a Bangladeshi seller to run a real online shop, with orders, payments, couriers and fraud checks
    already connected, in Bangla, with no monthly fee to start." The CTA uses adminUrl() (see nav.tsx's own
    note) since /sign-in is served by apps/admin, a different app from this one. */
export function Hero(): React.JSX.Element {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-brand-50 to-white">
      <div className="mx-auto max-w-4xl px-5 py-16 text-center sm:py-24">
        <h1 className="text-3xl leading-tight font-bold tracking-tight text-slate-900 sm:text-5xl">
          আপনার অনলাইন দোকান চালান <span className="text-brand-700">এক জায়গা থেকে</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
          অর্ডার, পেমেন্ট, কুরিয়ার আর ফ্রড চেক — সব একসাথে, বাংলায়। নোটবুকে বা মেসেঞ্জারে অর্ডার
          লিখে রাখার দিন শেষ।
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={adminUrl('/sign-in')}
            className="w-full rounded-xl bg-linear-to-br from-brand-500 to-brand-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-600/25 sm:w-auto"
          >
            বিনামূল্যে শুরু করুন
          </a>
          <span className="text-sm text-slate-500">কোনো মাসিক ফি ছাড়াই আজই শুরু করুন</span>
        </div>
      </div>
    </section>
  );
}
