interface Solution {
  problem: string;
  answer: string;
}

/** The exact message hierarchy from docs/MARKETING-PLAN.md §3 ("lead with the pain, not the feature list"),
    in the same order: fraud check, courier automation, pay-as-you-go, order tracking — plus payment matching
    from the "real problems" list in §2. */
const SOLUTIONS: Solution[] = [
  {
    problem: 'ভুয়া আর রিটার্ন অর্ডারে কুরিয়ার ফি আর স্টক দুটোই নষ্ট হয়',
    answer: 'শিপমেন্টের আগেই ভুয়া অর্ডার আটকান',
  },
  {
    problem: 'হাতে অর্ডার কনফার্ম করে কুরিয়ার বুক করতে প্রতিদিন ঘণ্টার পর ঘণ্টা চলে যায়',
    answer: 'এক ট্যাপে কুরিয়ার বুক করুন',
  },
  {
    problem: 'কাস্টমার বারবার জিজ্ঞেস করে, "আমার অর্ডার কোথায়?"',
    answer: 'কাস্টমাররা নিজেরাই অর্ডার ট্র্যাক করবে',
  },
  {
    problem: 'বিকাশ বা নগদে পেমেন্ট নিয়ে অর্ডারের সাথে মেলাতে গিয়ে ভুল হয়',
    answer: 'পেমেন্ট আর অর্ডার নিজে থেকেই মিলে যাবে',
  },
  {
    problem: 'কাজ করবে কিনা না জেনে আগে থেকে মাসিক ফি দিতে চান না',
    answer: 'বিক্রি করলেই শুধু খরচ — মাসিক ফি ছাড়াই শুরু করুন',
  },
];

export function Solutions(): React.JSX.Element {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-4xl px-5">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          আপনার সমস্যা, আমরা জানি
        </h2>
        <div className="mt-10 space-y-4">
          {SOLUTIONS.map((item) => (
            <div
              key={item.problem}
              className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-5 sm:flex-row sm:items-center sm:gap-6"
            >
              <p className="flex-1 text-sm text-slate-500 line-through decoration-slate-300">
                {item.problem}
              </p>
              <p className="flex-1 text-base font-semibold text-brand-700">{item.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
