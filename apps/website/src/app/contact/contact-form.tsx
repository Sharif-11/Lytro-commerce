'use client';

import { type ReactNode, useActionState, useState } from 'react';
import { buttonClass } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import {
  CONTACT_TOPICS,
  type ContactField,
  type ContactProblem,
  type ContactTopic,
} from '@/lib/contact/contact-submission';
import type { Language } from '@/lib/i18n/language';
import { type ContactFormState, sendContactMessage } from './actions';

const text = {
  title: { bn: 'আমাদের লিখুন', en: 'Write to us' },
  lead: {
    bn: 'এক কর্মদিবসের মধ্যে উত্তর দিই। সেটআপে সাহায্যের জন্য পেজের লিংক দিন, আমরা কল করবো।',
    en: 'We reply within one business day. For setup help, send your page link and we will call you.',
  },
  topic: { bn: 'কী নিয়ে?', en: 'What is it about?' },
  name: { bn: 'আপনার নাম', en: 'Your name' },
  phone: { bn: 'ফোন নম্বর', en: 'Phone number' },
  pageLink: {
    bn: 'ফেসবুক পেজ বা দোকানের লিংক (ঐচ্ছিক)',
    en: 'Facebook page or shop link (optional)',
  },
  message: { bn: 'মেসেজ', en: 'Message' },
  send: { bn: 'মেসেজ পাঠান', en: 'Send message' },
  sending: { bn: 'পাঠানো হচ্ছে…', en: 'Sending…' },
  privacy: {
    bn: 'আপনার নম্বর শুধু উত্তর দিতে ব্যবহার করি। মার্কেটিং SMS নেই।',
    en: 'We use your number only to reply. No marketing SMS.',
  },
  sentTitle: {
    bn: 'পেয়েছি। এক কর্মদিবসের মধ্যে উত্তর দেবো।',
    en: 'Got it. We will reply within one business day.',
  },
  sentSub: { bn: 'জরুরি হলে WhatsApp-এ দ্রুত হয়।', en: 'If it is urgent, WhatsApp is faster.' },
  another: { bn: 'আরেকটা পাঠান', en: 'Send another' },
  unavailable: {
    bn: 'ফর্মটা এখনো চালু হয়নি। WhatsApp-এ মেসেজ দিন বা ইমেইল করুন, উত্তর একইভাবে পাবেন।',
    en: 'The form is not switched on yet. Message us on WhatsApp or email instead; you get the same reply.',
  },
  failed: {
    bn: 'পাঠানো যায়নি। আরেকবার চেষ্টা করুন, বা WhatsApp-এ মেসেজ দিন।',
    en: 'It could not be sent. Try again, or message us on WhatsApp.',
  },
} as const;

const topicLabels: Record<ContactTopic, { bn: string; en: string }> = {
  setup: { bn: 'সেটআপে সাহায্য', en: 'Setup help' },
  demo: { bn: 'ডেমো বুক', en: 'Book a demo' },
  pricing: { bn: 'প্ল্যান আর দাম', en: 'Plans and pricing' },
  broken: { bn: 'কিছু ভেঙে গেছে', en: 'Something is broken' },
  partnership: { bn: 'পার্টনারশিপ', en: 'Partnership' },
};

const problemText: Record<
  ContactField,
  Partial<Record<ContactProblem, { bn: string; en: string }>>
> = {
  topic: { required: { bn: 'একটা বিষয় বেছে নিন।', en: 'Pick a topic.' } },
  name: {
    required: { bn: 'নামটা লিখুন।', en: 'Please enter your name.' },
    too_long: { bn: 'নামটা ছোট করুন।', en: 'Please shorten the name.' },
  },
  phone: {
    required: { bn: 'ফোন নম্বর দিন।', en: 'Enter your phone number.' },
    invalid: {
      bn: 'সঠিক বাংলাদেশী মোবাইল নম্বর দিন।',
      en: 'Enter a valid Bangladeshi mobile number.',
    },
  },
  pageLink: { too_long: { bn: 'লিংকটা ছোট করুন।', en: 'Please shorten the link.' } },
  message: {
    required: {
      bn: 'এক লাইন লিখুন, যাতে বুঝি কীভাবে সাহায্য করবো।',
      en: 'Write a line so we know how to help.',
    },
    too_long: { bn: 'মেসেজটা ছোট করুন।', en: 'Please shorten the message.' },
  },
};

const initial: ContactFormState = { status: 'idle' };

const inputClass =
  'num min-h-12 w-full rounded-control border border-neutral-200 bg-white px-3.5 text-[16px] text-ink placeholder:text-neutral-500 focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

/** Remounting the inner form is how "send another" clears the action state. */
export function ContactForm({ language }: { language: Language }) {
  const [round, setRound] = useState(0);
  return (
    <ContactFormRound
      key={round}
      language={language}
      onReset={() => {
        setRound((value) => value + 1);
      }}
    />
  );
}

function ContactFormRound({ language, onReset }: { language: Language; onReset: () => void }) {
  const [state, action, pending] = useActionState(sendContactMessage, initial);
  const [topic, setTopic] = useState<ContactTopic>('setup');
  const problems = state.status === 'invalid' ? state.problems : {};

  const problem = (field: ContactField) => {
    const code = problems[field];
    if (!code) return null;
    const message = problemText[field][code];
    return message ? message[language] : null;
  };

  if (state.status === 'sent') {
    return (
      <div className="rounded-card border border-line bg-white p-6 text-center shadow-card">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
          <Icon name="check" size={24} strokeWidth={2.5} />
        </span>
        <p className="mt-4 text-[18px] font-bold text-ink">{text.sentTitle[language]}</p>
        <p className="mt-1 text-[15px] text-neutral-700">{text.sentSub[language]}</p>
        <button type="button" onClick={onReset} className={`mt-6 ${buttonClass('outline')}`}>
          {text.another[language]}
        </button>
      </div>
    );
  }

  return (
    <form
      action={action}
      id="form"
      noValidate
      className="rounded-card border border-line bg-white p-5 shadow-card sm:p-6"
    >
      <h2 className="heading text-[22px] text-ink">{text.title[language]}</h2>
      <p className="mt-1 text-[15px] text-neutral-700">{text.lead[language]}</p>

      <fieldset className="mt-5">
        <legend className="text-[14px] font-bold text-ink">{text.topic[language]}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CONTACT_TOPICS.map((item) => (
            <label
              key={item}
              className={`inline-flex min-h-10 cursor-pointer items-center rounded-full border px-3.5 text-[14px] font-semibold ${
                topic === item
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-neutral-200 bg-white text-neutral-700'
              }`}
            >
              <input
                type="radio"
                name="topic"
                value={item}
                checked={topic === item}
                onChange={() => {
                  setTopic(item);
                }}
                className="sr-only"
              />
              {topicLabels[item][language]}
            </label>
          ))}
        </div>
        <FieldError message={problem('topic')} />
      </fieldset>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label={text.name[language]} error={problem('name')}>
          <input name="name" autoComplete="name" maxLength={60} className={inputClass} />
        </Field>
        <Field label={text.phone[language]} error={problem('phone')}>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="01XXXXXXXXX"
            className={inputClass}
          />
        </Field>
      </div>
      <div className="mt-4">
        <Field label={text.pageLink[language]} error={problem('pageLink')}>
          <input
            name="pageLink"
            type="url"
            inputMode="url"
            placeholder="facebook.com/…"
            className={inputClass}
          />
        </Field>
      </div>
      <div className="mt-4">
        <Field label={text.message[language]} error={problem('message')}>
          <textarea name="message" rows={4} maxLength={2000} className={`${inputClass} py-3`} />
        </Field>
      </div>

      {state.status === 'unavailable' ? (
        <Notice tone="warning" text={text.unavailable[language]} />
      ) : null}
      {state.status === 'failed' ? <Notice tone="danger" text={text.failed[language]} /> : null}

      <button
        type="submit"
        disabled={pending}
        className={`mt-5 w-full sm:w-auto ${buttonClass('primary', 'lg')} disabled:opacity-60`}
      >
        {pending ? text.sending[language] : text.send[language]}
      </button>
      <p className="mt-3 text-[13px] text-neutral-700">{text.privacy[language]}</p>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[14px] font-bold text-ink">{label}</span>
      <div className="mt-1.5">{children}</div>
      <FieldError message={error} />
    </label>
  );
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1.5 text-[13px] font-semibold text-danger">
      {message}
    </p>
  );
}

function Notice({ tone, text: body }: { tone: 'warning' | 'danger'; text: string }) {
  const classes =
    tone === 'warning' ? 'bg-accent-100 text-accent-700' : 'bg-danger-soft text-danger';
  return (
    <p
      role="alert"
      className={`mt-5 rounded-control px-4 py-3 text-[14px] font-semibold ${classes}`}
    >
      {body}
    </p>
  );
}
