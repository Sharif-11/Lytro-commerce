import type { Bilingual } from '../i18n/copy';

/** How the site names Lytro's ways to be reached, written once for the contact page and the landing page's contact
    section (SITE-PAGES-DESIGN §2, LANDING-PAGE-DESIGN §3). The numbers themselves are the help line's. */
export const channelWords = {
  eyebrow: { bn: 'যোগাযোগ', en: 'Contact' },
  title: { bn: 'একজন মানুষের সাথে কথা বলুন, বটের সাথে নয়', en: 'Talk to a person, not a bot' },
  whatsapp: { bn: 'WhatsApp', en: 'WhatsApp' },
  whatsappSub: {
    bn: 'সবচেয়ে দ্রুত। যেখানে আটকে আছেন তার স্ক্রিনশট পাঠান।',
    en: 'Fastest. Send a screenshot of where you are stuck.',
  },
  phone: { bn: 'ফোন', en: 'Phone' },
  phoneSub: {
    bn: 'কলে বা স্ক্রিন শেয়ারে লাইভ ডেমোর জন্য।',
    en: 'For a live demo on a call or screen share.',
  },
  email: { bn: 'ইমেইল', en: 'Email' },
  emailSub: {
    bn: 'পার্টনারশিপ, এজেন্সি, যেখানে লিখিত রেকর্ড দরকার।',
    en: 'Partnerships, agencies, anything that needs a paper trail.',
  },
} satisfies Record<string, Bilingual>;
