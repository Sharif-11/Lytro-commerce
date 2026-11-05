import type { Metadata } from 'next';
import QRCode from 'qrcode';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteNav } from '@/components/layout/site-nav';
import { buttonClass } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { Icon } from '@/components/ui/icon';
import { SiteEnvironment } from '@/lib/env';
import { Copy, type Bilingual } from '@/lib/i18n/copy';
import { requestLanguage } from '@/lib/i18n/read-language';
import { ListenerReleases, sizeInMegabytes } from '@/lib/listener/release';

export const metadata: Metadata = {
  title: 'লিসেনার অ্যাপ',
  description:
    'Lytro Listener অ্যাপ ডাউনলোড ও সেটআপ গাইড। bKash-এর SMS মিলিয়ে পেমেন্ট নিজে থেকেই ভেরিফাই হয়।',
  alternates: { canonical: '/listener' },
};

// docs/SITE-PAGES-DESIGN.md §6, the prototype's `listener`. The app's own words where it has them (brand/lytro-listener.html), so
// the guide and the app say the same thing.
const text = {
  crumb: { bn: 'লিসেনার অ্যাপ', en: 'Listener app' },
  title: { bn: 'লিসেনার অ্যাপ ডাউনলোড করুন', en: 'Download the listener app' },
  lead: {
    bn: 'যে ফোনে শপের bKash নম্বরের SIM আছে, সেই ফোনে Lytro Listener চালালে bKash-এর SMS মিলিয়ে পেমেন্ট নিজে থেকেই ভেরিফাই হয়।',
    en: 'Run Lytro Listener on the phone with your shop’s bKash SIM, and payments verify themselves from bKash’s SMS.',
  },
  download: { bn: 'APK ডাউনলোড করুন', en: 'Download the APK' },
  soon: {
    bn: 'অ্যাপটি এখনও ডাউনলোডের জন্য তৈরি হয়নি। তৈরি হলে এখানেই পাওয়া যাবে।',
    en: 'The app isn’t ready to download yet. It will be here when it is.',
  },
  talk: { bn: 'আমাদের সাথে কথা বলুন', en: 'Talk to us' },
  scan: {
    bn: 'কম্পিউটারে আছেন? ফোনের ক্যামেরা দিয়ে স্ক্যান করুন।',
    en: 'On a computer? Scan this with your phone.',
  },
  qr: { bn: 'এই পেজের QR কোড', en: 'QR code for this page' },
  warn: {
    bn: 'শুধু lytro.app থেকে ডাউনলোড করুন। অন্য কেউ ফাইল পাঠালে ইনস্টল করবেন না।',
    en: 'Download only from lytro.app. Don’t install a file anyone sends you.',
  },
  installTitle: { bn: 'ইনস্টল করুন', en: 'Install it' },
  blockTitle: { bn: 'Android 15 বা তার পরের ফোনে', en: 'On Android 15 or later' },
  blockLead: {
    bn: 'SMS-এর অনুমতি চাইলে Android বলতে পারে “App was denied access to SMS”। এতে ভয়ের কিছু নেই: ব্রাউজার থেকে ইনস্টল করা অ্যাপের SMS অনুমতি Android নিজে থেকে আটকে দেয়। এটা একবার চালু করলেই হবে, আর অ্যাপই ধাপগুলো দেখিয়ে দেবে:',
    en: 'When the app asks for SMS, Android may say “App was denied access to SMS”. Nothing is wrong: Android blocks SMS for apps installed from a browser until you allow it. You only do this once, and the app shows you these steps:',
  },
  setupTitle: { bn: 'সেটআপ গাইড', en: 'Setup guide' },
  after: {
    bn: 'এরপর ফোনটি চালু রাখুন। নেট না থাকলে রিসিট ফোনে জমা থাকে, 7 দিন পর্যন্ত, আর নেট এলেই নিজে থেকে যায়।',
    en: 'After that, keep the phone on. With no internet, receipts wait on the phone for up to 7 days and go by themselves when it’s back.',
  },
  updatesTitle: { bn: 'আপডেট', en: 'Updates' },
  updates: {
    bn: 'আপডেট দরকার হলে অ্যাপই জানাবে। এই পেজ থেকে নতুন ভার্সন ডাউনলোড করে পুরোনোটির ওপরেই ইনস্টল করুন। ফোনের পেয়ারিং ঠিক থাকবে।',
    en: 'When an update is needed, the app tells you. Download it from this page and install it over the old one. The phone stays paired.',
  },
  checkFile: { bn: 'ফাইলটি মিলিয়ে দেখুন (SHA-256)', en: 'Check the file (SHA-256)' },
  help: { bn: 'কোনো ধাপে আটকে গেছেন? আমাদের মেসেজ করুন।', en: 'Stuck on a step? Message us.' },
  whatsapp: { bn: 'WhatsApp করুন', en: 'WhatsApp us' },
} satisfies Record<string, Bilingual>;

const install: Bilingual[] = [
  { bn: 'APK ডাউনলোড করুন', en: 'Download the APK' },
  {
    bn: 'Android জিজ্ঞেস করলে “Install unknown apps” থেকে ব্রাউজারটিকে Allow করুন',
    en: 'If Android asks, allow your browser under “Install unknown apps”',
  },
  {
    bn: 'Play Protect সতর্ক করলে “More details” → “Install anyway” চাপুন',
    en: 'If Play Protect warns you, tap “More details” → “Install anyway”',
  },
  { bn: 'অ্যাপটি খুলে সেটআপ শেষ করুন', en: 'Open the app and finish setup' },
];

const unblock: Bilingual[] = [
  { bn: 'অ্যাপের বাটন চেপে App info খুলুন', en: 'Open App info from the app’s button' },
  {
    bn: 'ওপরে ডানদিকের ⋮ মেনু থেকে “Allow restricted settings” চাপুন। পিন চাইলে দিন।',
    en: 'In the ⋮ menu at the top right, tap “Allow restricted settings”. Enter your PIN if asked.',
  },
  { bn: 'অ্যাপে ফিরে এসে আবার অনুমতি দিন', en: 'Come back to the app and allow it again' },
];

const setup: { title: Bilingual; body: Bilingual }[] = [
  {
    title: { bn: 'ফোন পেয়ার করুন', en: 'Pair the phone' },
    body: {
      bn: 'ড্যাশবোর্ডে যান: সেটিংস → লিসেনার ফোন → ফোন পেয়ার করুন। অ্যাপে QR স্ক্যান করুন, অথবা কোডটি টাইপ করুন। কোড 10 মিনিট খোলা থাকে।',
      en: 'In the dashboard, go to Settings → Listener phones → Pair a phone. Scan the QR in the app, or type the code. A code stays open for 10 minutes.',
    },
  },
  {
    title: { bn: 'SMS পড়ার অনুমতি দিন', en: 'Allow reading SMS' },
    body: {
      bn: 'শুধু bKash-এর পেমেন্ট SMS পাঠানো হয়। অন্য কোনো SMS ফোনের বাইরে যায় না, আর এই অ্যাপ নিজে কখনও SMS পাঠায় না।',
      en: 'Only bKash’s payment SMS are sent. No other SMS leaves the phone, and the app never sends SMS itself.',
    },
  },
  {
    title: { bn: 'নোটিফিকেশন চালু করুন', en: 'Turn on notifications' },
    body: {
      bn: 'অ্যাপ চালু আছে কি না নোটিফিকেশনে সবসময় দেখা যাবে। কোনো সমস্যা হলে এখানেই জানাবে।',
      en: 'A notification always shows the app is running, and tells you if something goes wrong.',
    },
  },
  {
    title: { bn: 'ব্যাটারি সেভার থেকে বাদ দিন', en: 'Exempt it from the battery saver' },
    body: {
      bn: 'না হলে ফোন অ্যাপটি বন্ধ করে দিতে পারে, তখন পেমেন্ট নিজে থেকে ভেরিফাই হবে না।',
      en: 'Otherwise the phone may stop the app, and payments won’t verify by themselves.',
    },
  },
  {
    title: { bn: 'একটা টেস্ট করুন', en: 'Test it' },
    body: {
      bn: 'অন্য একটি ফোন থেকে শপের নম্বরে অল্প টাকা Send Money করুন। SMS এলেই অ্যাপে দেখা যাবে।',
      en: 'From another phone, Send Money a small amount to the shop’s number. It shows in the app when the SMS arrives.',
    },
  },
];

/** A numbered list, its figures in teal circles (the prototype's `.dl-steps`). */
function Steps({ children }: { children: React.ReactNode }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-3.5 p-0 [counter-reset:step] [&>li]:relative [&>li]:min-h-[30px] [&>li]:ps-[42px] [&>li]:[counter-increment:step] [&>li]:before:absolute [&>li]:before:start-0 [&>li]:before:top-0 [&>li]:before:grid [&>li]:before:size-[30px] [&>li]:before:place-items-center [&>li]:before:rounded-full [&>li]:before:bg-brand-100 [&>li]:before:text-[14px] [&>li]:before:font-semibold [&>li]:before:text-brand-800 [&>li]:before:content-[counter(step)]">
      {children}
    </ol>
  );
}

export default async function ListenerPage() {
  const language = await requestLanguage.read();
  const copy = new Copy(language);
  const env = SiteEnvironment.current();
  const release = await new ListenerReleases(env.listenerDownloadUrl).latest();
  // The QR opens this page on the phone, not the file, so the guide comes with it.
  const qr = release
    ? await QRCode.toString(`${env.siteUrl}/listener`, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 1,
      })
    : null;
  const version = release
    ? language === 'bn'
      ? `ভার্সন ${release.version} · ${String(sizeInMegabytes(release.bytes))} MB · Android 7 বা তার পরের ভার্সন`
      : `Version ${release.version} · ${String(sizeInMegabytes(release.bytes))} MB · Android 7 or later`
    : null;

  return (
    <>
      <SiteNav language={language} />
      <main>
        <section className="relative overflow-hidden bg-brand-900 text-white">
          <div className="dot-grid pointer-events-none absolute inset-0" aria-hidden="true" />
          <Container className="relative grid items-center gap-7 py-14 sm:py-16 lg:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <p className="m-0 text-[14px] text-brand-100">
                lytro.app / <b className="text-white">{copy.of(text.crumb)}</b>
              </p>
              <h1 className="mt-4 text-[clamp(1.9rem,1.3rem+3vw,3rem)] leading-[1.22] font-extrabold">
                {copy.of(text.title)}
              </h1>
              <p className="mt-4 max-w-[640px] text-[17px] text-[#eef9f7]">{copy.of(text.lead)}</p>
              {release ? (
                <div className="mt-5.5">
                  <a href={release.url} className={buttonClass('accent', 'lg')}>
                    <Icon name="download" />
                    {copy.of(text.download)}
                  </a>
                  <p className="mt-2.5 text-[14px] text-[#eef9f7]">{version}</p>
                </div>
              ) : (
                <div className="mt-5.5">
                  <p className="mb-3.5 font-semibold">{copy.of(text.soon)}</p>
                  <a href="/contact" className={buttonClass('light-outline', 'md')}>
                    {copy.of(text.talk)}
                  </a>
                </div>
              )}
            </div>
            {qr ? (
              <div className="hidden max-w-[220px] justify-items-center gap-2.5 text-center text-[14px] text-[#eef9f7] lg:grid">
                <div
                  role="img"
                  aria-label={copy.of(text.qr)}
                  className="size-[172px] rounded-[14px] bg-white p-2 [&>svg]:size-full"
                  // The library's own drawing of this site's address: nothing a visitor or the bucket can change.
                  dangerouslySetInnerHTML={{ __html: qr }}
                />
                <p className="m-0">{copy.of(text.scan)}</p>
              </div>
            ) : null}
          </Container>
        </section>

        <section className="bg-white">
          <Container className="py-10 sm:py-14">
            <div className="mx-auto flex max-w-[720px] flex-col gap-5">
              <div
                role="note"
                className="flex items-start gap-2.5 rounded-[12px] bg-accent-100 px-3.5 py-3 font-semibold text-neutral-900"
              >
                <Icon name="shield" />
                <span>{copy.of(text.warn)}</span>
              </div>

              <h2 className="mt-5 text-[22px] font-bold">{copy.of(text.installTitle)}</h2>
              <Steps>
                {install.map((step) => (
                  <li key={step.en}>{copy.of(step)}</li>
                ))}
              </Steps>

              <div className="rounded-[18px] border border-accent-300 bg-white p-4.5">
                <h3 className="mb-1.5 text-[17px] font-bold">{copy.of(text.blockTitle)}</h3>
                <p className="mb-3.5 text-neutral-700">{copy.of(text.blockLead)}</p>
                <Steps>
                  {unblock.map((step) => (
                    <li key={step.en}>{copy.of(step)}</li>
                  ))}
                </Steps>
              </div>

              <h2 id="setup" className="mt-5 scroll-mt-24 text-[22px] font-bold">
                {copy.of(text.setupTitle)}
              </h2>
              <Steps>
                {setup.map((step) => (
                  <li key={step.title.en}>
                    <b className="block">{copy.of(step.title)}</b>
                    <span className="mt-0.5 block text-neutral-700">{copy.of(step.body)}</span>
                  </li>
                ))}
              </Steps>
              <p className="m-0 text-neutral-700">{copy.of(text.after)}</p>

              {release ? (
                <div>
                  <h2 className="mt-5 mb-3 text-[22px] font-bold">{copy.of(text.updatesTitle)}</h2>
                  <p className="m-0 text-neutral-700">{copy.of(text.updates)}</p>
                  <details className="mt-3">
                    <summary className="min-h-8 cursor-pointer font-semibold text-brand-700">
                      {copy.of(text.checkFile)}
                    </summary>
                    <code className="mt-1.5 block rounded-[8px] bg-neutral-50 px-3 py-2.5 text-[13px] [overflow-wrap:anywhere]">
                      {release.sha256}
                    </code>
                  </details>
                </div>
              ) : null}

              {env.support.whatsapp ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-5">
                  <p className="m-0 text-neutral-700">{copy.of(text.help)}</p>
                  <a
                    href={`https://wa.me/${env.support.whatsapp}`}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonClass('outline', 'md')}
                  >
                    {copy.of(text.whatsapp)}
                  </a>
                </div>
              ) : null}
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter language={language} />
    </>
  );
}
