'use client';

import { type SubmitEvent, useId, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { ClaimSlug } from '@/lib/claim-slug';
import type { Language } from '@/lib/i18n/language';

const text = {
  label: { bn: 'দোকানের লিংক', en: 'Shop link' },
  placeholder: { bn: 'আপনার দোকানের নাম', en: 'your-shop-name' },
  submit: { bn: 'অনলাইন স্টোর তৈরি করুন', en: 'Create your online store' },
  preview: { bn: 'আপনার দোকানের ঠিকানা হবে', en: 'Your shop address will be' },
  invalid: {
    bn: 'ইংরেজি অক্ষর, সংখ্যা আর হাইফেনে ৩ থেকে ৩০ অক্ষর। পরের ধাপে বদলানো যাবে।',
    en: 'Use 3 to 30 letters, digits and hyphens. You can change it in the next step.',
  },
} as const;

const claim = new ClaimSlug();

/** The hero's claim-your-shop box, the sketch's white capsule with the shop's address suffix and the marigold button
    (LANDING-PAGE-DESIGN.md §2, §4). It normalises what the seller types into a valid shop link and hands it to the
    sign-up flow; the create-shop step checks availability. The note under it stays in the page, empty, so a screen
    reader hears the address or the rule when they appear. */
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
    <form onSubmit={submit} className="claim-form" noValidate>
      <label htmlFor={id} className="sr-only">
        {text.label[language]}
      </label>
      <div className="claim">
        <div className="field">
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
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            maxLength={40}
          />
          <span className="suffix">.{platformDomain}</span>
        </div>
        <button type="submit" className="btn btn-accent">
          <span>{text.submit[language]}</span>
          <Icon name="arrow" size={18} />
        </button>
      </div>
      <p className="claim-note" aria-live="polite">
        {value.length > 0 && valid ? (
          <>
            {text.preview[language]}{' '}
            <b>
              {slug}.{platformDomain}
            </b>
          </>
        ) : touched && value.length > 0 && !valid ? (
          text.invalid[language]
        ) : null}
      </p>
    </form>
  );
}
