interface Step {
  number: string;
  title: string;
  body: string;
}

/** Matches the real, already-built sign-up flow (AUTH-12, AUTH-28) — phone verify, then shop details, then
    the dashboard — not a generic placeholder sequence. */
const STEPS: Step[] = [
  {
    number: '১',
    title: 'ফোন নম্বর দিয়ে সাইন আপ করুন',
    body: 'শুধু আপনার ফোন নম্বর দিন, একটি কোড দিয়ে ভেরিফাই করুন — পাসওয়ার্ড লাগবে না।',
  },
  {
    number: '২',
    title: 'আপনার দোকানের তথ্য দিন',
    body: 'দোকানের নাম আর একটি লিংক ঠিক করুন — আপনার দোকান তৈরি হয়ে যাবে।',
  },
  {
    number: '৩',
    title: 'বিক্রি শুরু করুন',
    body: 'অর্ডার নিন, কুরিয়ার বুক করুন, পেমেন্ট ট্র্যাক করুন — সব এক জায়গা থেকে।',
  },
];

export function HowItWorks(): React.JSX.Element {
  return (
    <section className="bg-brand-50/50 py-16 sm:py-20">
      <div className="mx-auto max-w-4xl px-5">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          শুরু করুন ৩ মিনিটে
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.number} className="rounded-2xl bg-white p-6 shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white">
                {step.number}
              </span>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
