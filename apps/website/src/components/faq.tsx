interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: 'Lytro কী?',
    answer:
      'Lytro হলো বাংলাদেশি অনলাইন সেলারদের জন্য একটি প্ল্যাটফর্ম, যেখানে অর্ডার, পেমেন্ট, কুরিয়ার আর ফ্রড চেক — সব এক জায়গা থেকে ম্যানেজ করা যায়, সম্পূর্ণ বাংলায়।',
  },
  {
    question: 'মাসিক ফি দিতে হবে?',
    answer:
      'না। পে-অ্যাজ-ইউ-গোতে দোকান খোলা সম্পূর্ণ ফ্রি — শুধু অর্ডার ডেলিভার হলেই একটা ছোট ফি কাটে। চাইলে পরে ফিক্সড মাসিক প্ল্যানেও যেতে পারবেন।',
  },
  {
    question: 'আমার ডেটা কি নিরাপদ?',
    answer:
      'হ্যাঁ। আপনার অর্ডার, কাস্টমার আর পেমেন্টের তথ্য শুধু আপনার দোকানের জন্যই — অন্য কোনো দোকান দেখতে পারবে না।',
  },
  {
    question: 'কোন কুরিয়ার সাপোর্ট করে?',
    answer:
      'দেশের বড় কুরিয়ার সার্ভিসগুলোর সাথে এক ট্যাপে বুকিং আর রিয়েল-টাইম ট্র্যাকিং করা যাবে।',
  },
  {
    question: 'স্টাফ যোগ করতে পারব?',
    answer:
      'হ্যাঁ। আপনার দোকানে স্টাফ যোগ করে প্রত্যেকের জন্য আলাদা রোল আর পারমিশন ঠিক করে দিতে পারবেন — কে কী দেখতে বা করতে পারবে, সেটা আপনার হাতে।',
  },
];

export function Faq(): React.JSX.Element {
  return (
    <section className="bg-brand-50/50 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl px-5">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          প্রশ্ন থাকতে পারে
        </h2>
        <div className="mt-8 space-y-3">
          {FAQS.map((item) => (
            <details
              key={item.question}
              className="group rounded-xl bg-white p-5 shadow-sm [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-900">
                {item.question}
                <span className="ml-3 shrink-0 text-brand-600 transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
