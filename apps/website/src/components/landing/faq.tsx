import { Container } from '@/components/ui/container';
import { Icon } from '@/components/ui/icon';
import { SectionHeading } from '@/components/ui/section-heading';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import type { Language } from '@/lib/i18n/language';

const text = {
  eyebrow: { bn: 'প্রশ্ন থাকতে পারে', en: 'Questions' },
  title: { bn: 'সোজা উত্তর', en: 'Straight answers' },
} satisfies Record<string, Bilingual>;

const items: { q: Bilingual; a: Bilingual }[] = [
  {
    q: { bn: 'মাসিক ফি দিতে হবে?', en: 'Do I have to pay a monthly fee?' },
    a: {
      bn: 'না। পে-অ্যাজ-ইউ-গো-তে দোকান খোলা ফ্রি, শুধু অর্ডার ডেলিভার হলেই ছোট একটা ফি কাটে। পরে ফিক্সড প্ল্যান সস্তা পড়লে সেখানে যেতে পারবেন।',
      en: 'No. On pay-as-you-go, opening the shop is free and a small fee is charged only when an order is delivered. You can move to a fixed plan later if that works out cheaper for you.',
    },
  },
  {
    q: {
      bn: 'আমি ফেসবুক পেজ থেকে বিক্রি করি। ওয়েবসাইট লাগবে?',
      en: 'I sell from a Facebook page. Do I need a website?',
    },
    a: {
      bn: 'না। পেজেই বিক্রি করুন। Lytro শুধু অর্ডার কনফার্ম, কুরিয়ার বুক আর পেমেন্ট মেলানোর এক জায়গা দেয়। স্টোরফ্রন্ট চাইলে আছে, না চাইলে বন্ধ রাখা যায়।',
      en: 'No. Keep selling on your page. Lytro gives you one place to confirm orders, book couriers and match payments. The storefront is there when you want it, and you can switch it off.',
    },
  },
  {
    q: {
      bn: 'কোন কুরিয়ার আর পেমেন্ট সাপোর্ট করে?',
      en: 'Which couriers and payments are supported?',
    },
    a: {
      bn: 'পেমেন্টে বিকাশ আর নগদ, কুরিয়ারে লঞ্চে Steadfast আর Pathao, সবই আপনার নিজের অ্যাকাউন্টে। নতুনগুলো লাইভ হলে যোগ হয়, আজ যা কাজ করে শুধু সেটাই লেখা থাকে।',
      en: 'bKash and Nagad for payments, Steadfast and Pathao for courier booking at launch, each on your own account. More are added as they go live, and we only list what works today.',
    },
  },
  {
    q: { bn: 'আমার ডেটা কি অন্য দোকান দেখতে পায়?', en: 'Is my data safe from other shops?' },
    a: {
      bn: 'না। আপনার অর্ডার, কাস্টমার আর পেমেন্ট শুধু আপনার দোকানের। প্রতিটা রিকোয়েস্ট আপনার দোকানের সাথে মিলিয়ে দেখা হয়, আর কে কী বদলালো তার লগ থাকে।',
      en: 'No. Your orders, customers and payments belong to your shop only. Every request is checked against your shop, and every change is logged with who made it.',
    },
  },
  {
    q: { bn: 'ট্রায়াল শেষ হলে কী হয়?', en: 'What happens when the trial ends?' },
    a: {
      bn: 'কিছু হারায় না। ৩০ দিন পর এমনিতেই পে-অ্যাজ-ইউ-গো-তে চলে যাবেন, লিমিট আরও বড় হয়ে। কোনো পেওয়াল নেই, ডেটা মোছা নেই।',
      en: 'Nothing is lost. After 30 days you simply continue on pay-as-you-go with wider limits. There is no paywall and no data deletion.',
    },
  },
  {
    q: { bn: 'স্টাফ যোগ করা যাবে?', en: 'Can I add staff?' },
    a: {
      bn: 'হ্যাঁ। স্টাফের নিজের ফোন নম্বর দিয়ে যোগ করুন আর রোল দিন: শুধু অর্ডার, শুধু প্রোডাক্ট, বা সব। কে কী দেখবে সেটা আপনার হাতে।',
      en: 'Yes. Add staff with their own phone number and give each a role: orders only, products only, or everything. You decide who sees what.',
    },
  },
];

/** Native disclosure elements: no script, the first answer open so answers are visibly there, and one
    open at a time through the shared `name`. */
export function Faq({ language }: { language: Language }) {
  const copy = new Copy(language);
  return (
    <section id="faq" className="scroll-mt-16 bg-white">
      <Container className="py-16 sm:py-20">
        <SectionHeading eyebrow={copy.of(text.eyebrow)} title={copy.of(text.title)} />
        <div className="mx-auto mt-10 max-w-[760px] divide-y divide-line rounded-card border border-line bg-white shadow-card">
          {items.map((item, index) => (
            <details key={item.q.en} name="faq" open={index === 0} className="group px-5">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[16px] font-bold text-ink [&::-webkit-details-marker]:hidden">
                {copy.of(item.q)}
                <Icon
                  name="chevron"
                  size={20}
                  className="text-brand-700 transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="pb-5 text-[15px] text-neutral-700">{copy.of(item.a)}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
