import { adminUrl } from '@/lib/admin-url';
import { fetchPublic } from '@/lib/api';
import type { BillingTerm, Plan, PlanPrice } from '@/lib/plans';

const LIMIT_LABEL: Record<string, string> = {
  products: 'প্রোডাক্ট',
  orders_handled_monthly: 'অর্ডার/মাস',
  staff: 'স্টাফ সিট',
  essential_sms_monthly: 'SMS/মাস',
};

interface FixedPlanCard {
  plan: Plan;
  price: string | null;
  termId: string;
  termLabel: string;
}

async function loadFixedPlans(): Promise<FixedPlanCard[]> {
  const [plans, terms] = await Promise.all([
    fetchPublic<Plan[]>('/plans'),
    fetchPublic<BillingTerm[]>('/billing-terms'),
  ]);
  if (!plans || !terms) return [];
  const shortestTerm = [...terms]
    .filter((term) => term.visible)
    .sort((a, b) => a.months - b.months)[0];
  if (!shortestTerm) return [];

  return Promise.all(
    plans
      .filter((plan) => plan.forSale)
      .sort((a, b) => a.rank - b.rank)
      .map(async (plan): Promise<FixedPlanCard> => {
        const prices = await fetchPublic<PlanPrice[]>(`/plans/${plan.id}/prices`);
        const match = prices?.find((row) => row.billingTermId === shortestTerm.id) ?? null;
        return {
          plan,
          price: match?.price ?? null,
          termId: shortestTerm.id,
          termLabel: shortestTerm.labelBn,
        };
      }),
  );
}

/** D2-12: rebuilt against the real public `plans`/`billing-terms`/`plans/:id/prices` endpoints — replacing
    the deliberately-static, no-figures version Phase 1 shipped (PHASE-1-PLAN.md slice 11's own "done when"
    rule no longer applies once a real purchase flow exists, PHASE-2-PLAN.md D2-12). Each fixed plan's Buy
    button carries the plan and the shortest visible term into sign-up as a query param
    (`?planId=&termId=`), read by apps/admin's own sign-in screen and carried through to a pre-filled
    purchase screen right after create-shop. A plan or term fetch failing degrades to just the
    pay-as-you-go card and a plain "get started" link, rather than a broken page. */
export async function Pricing(): Promise<React.JSX.Element> {
  const fixedPlans = await loadFixedPlans();

  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-5">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          যেভাবে খুশি শুরু করুন
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-500">
          কাজ করবে কিনা আগে দেখুন, তারপর সিদ্ধান্ত নিন।
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border-2 border-brand-500 bg-brand-50/40 p-6">
            <span className="inline-block rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
              রিকমেন্ডেড
            </span>
            <h3 className="mt-3 text-lg font-bold text-slate-900">পে-অ্যাজ-ইউ-গো</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              কোনো মাসিক ফি নেই। শুধু অর্ডার ডেলিভার হলেই একটা ছোট ফি কাটবে। দোকান খোলা একদম ফ্রি।
            </p>
            <a
              href={adminUrl('/sign-in')}
              className="mt-5 inline-block w-full rounded-xl bg-brand-600 px-4 py-2.5 text-center text-sm font-semibold text-white"
            >
              শুরু করুন
            </a>
          </div>

          {fixedPlans.map(({ plan, price, termId, termLabel }) => (
            <div key={plan.id} className="rounded-2xl border border-slate-200 p-6">
              <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
              {plan.description ? (
                <p className="mt-1 text-sm text-slate-500">{plan.description}</p>
              ) : null}
              <p className="mt-3 text-2xl font-bold text-slate-900">
                {price ? `৳${price}` : '—'}
                <span className="text-sm font-normal text-slate-400"> / {termLabel}</span>
              </p>
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {Object.entries(plan.limits)
                  .filter(([key]) => key in LIMIT_LABEL)
                  .map(([key, value]) => (
                    <li key={key}>
                      {LIMIT_LABEL[key]}: {value}
                    </li>
                  ))}
              </ul>
              <a
                href={adminUrl(`/sign-in?planId=${plan.id}&termId=${termId}`)}
                className="mt-5 inline-block w-full rounded-xl border border-brand-600 px-4 py-2.5 text-center text-sm font-semibold text-brand-700"
              >
                এই প্ল্যান নিন
              </a>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          প্রথম ৩০ দিন ফ্রি — কোনো কার্ড লাগবে না, ডেটা হারানোর ভয়ও নেই।
        </p>
      </div>
    </section>
  );
}
