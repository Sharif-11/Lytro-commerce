/** Describes the offer from docs/MARKETING-PLAN.md §4 only — deliberately no ৳ figures or plan names tied to
    real prices. PHASE-1-PLAN.md slice 11's own "done when" rule: no plan price or figure hard-coded as if
    purchasable today, since the purchase flow itself is Phase 2 work (D3). */
export function Pricing(): React.JSX.Element {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-4xl px-5">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          যেভাবে খুশি শুরু করুন
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-500">
          কাজ করবে কিনা আগে দেখুন, তারপর সিদ্ধান্ত নিন।
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border-2 border-brand-500 bg-brand-50/40 p-6">
            <span className="inline-block rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
              রিকমেন্ডেড
            </span>
            <h3 className="mt-3 text-lg font-bold text-slate-900">পে-অ্যাজ-ইউ-গো</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              কোনো মাসিক ফি নেই। শুধু অর্ডার ডেলিভার হলেই একটা ছোট ফি কাটবে। দোকান খোলা একদম ফ্রি।
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900">ফিক্সড প্ল্যান</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              অর্ডার বেশি হলে একটা নির্দিষ্ট মাসিক ফিতে বেশি লিমিট আর ফিচার — দোকান বড় হওয়ার সাথে
              সাথে প্ল্যান পাল্টাতে পারবেন।
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          প্রথম ৩০ দিন ফ্রি — কোনো কার্ড লাগবে না, ডেটা হারানোর ভয়ও নেই।
        </p>
      </div>
    </section>
  );
}
