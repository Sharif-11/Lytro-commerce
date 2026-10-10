import { adminUrl } from '@/lib/admin-url';

/** Deliberately minimal — no links to a Privacy Policy, Terms of Service or blog, since none of those pages
    exist yet in Phase 1. A footer link to a page that doesn't exist is a worse first impression than no
    footer links at all. */
export function Footer(): React.JSX.Element {
  return (
    <footer className="border-t border-slate-100 bg-white py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 text-center">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">
            L
          </span>
          <span className="text-base font-bold tracking-tight text-slate-900">Lytro</span>
        </div>
        <p className="max-w-sm text-sm text-slate-500">
          বাংলাদেশি অনলাইন সেলারদের জন্য তৈরি, একটি প্ল্যাটফর্মে অর্ডার, পেমেন্ট আর কুরিয়ার ম্যানেজ
          করার সহজ উপায়।
        </p>
        <a
          href={adminUrl('/sign-in')}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          দোকান শুরু করুন
        </a>
        <p className="mt-4 text-xs text-slate-400">© {new Date().getFullYear()} Lytro</p>
      </div>
    </footer>
  );
}
