'use client';

import { type SubmitEvent, useId, useState } from 'react';
import { buttonClass } from '@/components/ui/button';
import { ClaimSlug } from '@/lib/claim-slug';
import type { Language } from '@/lib/i18n/language';

const text = {
  label: { bn: 'দোকানের লিংক', en: 'Shop link' },
  placeholder: { bn: 'আপনার দোকানের নাম', en: 'your-shop-name' },
  submit: { bn: 'দোকান নিন', en: 'Claim my shop' },
  preview: { bn: 'আপনার দোকানের ঠিকানা হবে', en: 'Your shop address will be' },
  invalid: {
    bn: 'ইংরেজি অক্ষর, সংখ্যা আর হাইফেনে ৩ থেকে ৩০ অক্ষর। পরের ধাপে বদলানো যাবে।',
    en: 'Use 3 to 30 letters, digits and hyphens. You can change it in the next step.',
  },
} as const;

const claim = new ClaimSlug();

/** The hero's claim-your-shop input (LANDING-PAGE-DESIGN.md §2, §4). It normalises what the seller types
    into a valid shop link and hands it to the sign-up flow; the create-shop step checks availability. */
export function ClaimBox({
  language,
  signInUrl,
  platformDomain,
}: {
  language: Language;
  signInUrl: string;
  platformDomain: string;
}) {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const id = useId();
  const slug = claim.normalise(value);
  const valid = claim.isValid(slug);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    const url = new URL(signInUrl);
    if (valid) url.searchParams.set('shop', slug);
    window.location.assign(url.toString());
  };

  return (
    <form onSubmit={submit} className="w-full max-w-[520px]" noValidate>
      <label htmlFor={id} className="sr-only">
        {text.label[language]}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex min-h-12 flex-1 items-center rounded-control border border-white/25 bg-white/10 pr-3 pl-1 focus-within:border-accent-300 focus-within:ring-2 focus-within:ring-accent-300/40">
          <input
            id={id}
            name="shop"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
            }}
            onBlur={() => {
              setTouched(true);
            }}
            placeholder={text.placeholder[language]}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            maxLength={40}
            className="num min-w-0 flex-1 bg-transparent px-3 py-2 text-[16px] text-white placeholder:text-white/60 focus:outline-none"
          />
          <span className="num shrink-0 text-[14px] font-semibold text-white/80">
            .{platformDomain}
          </span>
        </div>
        <button type="submit" className={buttonClass('accent', 'lg', 'shrink-0')}>
          {text.submit[language]}
        </button>
      </div>
      <p className="mt-2 min-h-5 text-[13px] text-white/85" aria-live="polite">
        {value.length > 0 && valid ? (
          <>
            {text.preview[language]}{' '}
            <span className="num font-semibold text-white">
              {slug}.{platformDomain}
            </span>
          </>
        ) : touched && value.length > 0 && !valid ? (
          text.invalid[language]
        ) : null}
      </p>
    </form>
  );
}
