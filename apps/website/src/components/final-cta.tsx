import Link from 'next/link';

export function FinalCta(): React.JSX.Element {
  return (
    <section className="bg-linear-to-br from-brand-600 to-brand-700 py-16 text-center sm:py-20">
      <div className="mx-auto max-w-2xl px-5">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">আজই শুরু করুন</h2>
        <p className="mt-3 text-sm text-brand-50 sm:text-base">
          কোনো মাসিক ফি ছাড়াই, কোনো কার্ড ছাড়াই — মাত্র ৩ মিনিটে আপনার দোকান তৈরি করুন।
        </p>
        <Link
          href="/sign-in"
          className="mt-6 inline-block rounded-xl bg-white px-6 py-3.5 text-base font-semibold text-brand-700 shadow-lg"
        >
          বিনামূল্যে শুরু করুন
        </Link>
      </div>
    </section>
  );
}
