import { CODE_LENGTH } from '../common/limits';
import { FIELD_LABELS } from './field-labels';
import {
  FieldProblemCode,
  type FieldError,
  type FieldProblem,
  type Language,
  type Translation,
} from './field-problem';

/** A message with the field's name in it, and the same message for a field with no name ("this"). */
interface Template {
  labeled: Translation;
  unlabeled: Translation;
}

function same(text: Translation): Template {
  return { labeled: text, unlabeled: text };
}

/**
 * API-16: one plain message per problem, written for a shop owner rather than a developer -- what is wrong and
 * how to fix it. `{label}` is the field's name (FIELD_LABELS); `{min}`, `{max}` and `{length}` the limit broken.
 */
const TEMPLATES: Readonly<Record<FieldProblemCode, Template>> = {
  [FieldProblemCode.Required]: {
    labeled: { en: '{label} is required.', bn: '{label} দিন।' },
    unlabeled: { en: 'Please fill this in.', bn: 'এটি পূরণ করুন।' },
  },
  [FieldProblemCode.TooShort]: {
    labeled: {
      en: '{label} is too short. Use at least {min} characters.',
      bn: '{label} খুব ছোট। কমপক্ষে {min} অক্ষর দিন।',
    },
    unlabeled: {
      en: 'This is too short. Use at least {min} characters.',
      bn: 'এটি খুব ছোট। কমপক্ষে {min} অক্ষর দিন।',
    },
  },
  [FieldProblemCode.TooLong]: {
    labeled: {
      en: '{label} is too long. Use at most {max} characters.',
      bn: '{label} অনেক বড়। সর্বোচ্চ {max} অক্ষর দিন।',
    },
    unlabeled: {
      en: 'This is too long. Use at most {max} characters.',
      bn: 'এটি অনেক বড়। সর্বোচ্চ {max} অক্ষর দিন।',
    },
  },
  [FieldProblemCode.WrongLength]: {
    labeled: {
      en: '{label} must be exactly {length} characters.',
      bn: '{label} ঠিক {length} অক্ষরের হতে হবে।',
    },
    unlabeled: {
      en: 'This must be exactly {length} characters.',
      bn: 'এটি ঠিক {length} অক্ষরের হতে হবে।',
    },
  },
  [FieldProblemCode.TooSmall]: {
    labeled: { en: '{label} must be at least {min}.', bn: '{label} কমপক্ষে {min} হতে হবে।' },
    unlabeled: { en: 'This must be at least {min}.', bn: 'এটি কমপক্ষে {min} হতে হবে।' },
  },
  [FieldProblemCode.TooLarge]: {
    labeled: { en: '{label} must be at most {max}.', bn: '{label} সর্বোচ্চ {max} হতে পারে।' },
    unlabeled: { en: 'This must be at most {max}.', bn: 'এটি সর্বোচ্চ {max} হতে পারে।' },
  },
  [FieldProblemCode.TooFew]: {
    labeled: { en: '{label}: choose at least {min}.', bn: '{label}: কমপক্ষে {min}টি বেছে নিন।' },
    unlabeled: { en: 'Choose at least {min}.', bn: 'কমপক্ষে {min}টি বেছে নিন।' },
  },
  [FieldProblemCode.TooMany]: {
    labeled: { en: '{label}: choose at most {max}.', bn: '{label}: সর্বোচ্চ {max}টি বেছে নিন।' },
    unlabeled: { en: 'Choose at most {max}.', bn: 'সর্বোচ্চ {max}টি বেছে নিন।' },
  },
  [FieldProblemCode.NotANumber]: {
    labeled: { en: '{label} must be a number.', bn: '{label} সংখ্যায় দিন।' },
    unlabeled: { en: 'Enter a number.', bn: 'একটি সংখ্যা দিন।' },
  },
  [FieldProblemCode.NotWholeNumber]: {
    labeled: {
      en: '{label} must be a whole number, without decimals.',
      bn: '{label} দশমিক ছাড়া পূর্ণ সংখ্যায় দিন।',
    },
    unlabeled: {
      en: 'Enter a whole number, without decimals.',
      bn: 'দশমিক ছাড়া পূর্ণ সংখ্যা দিন।',
    },
  },
  [FieldProblemCode.TooManyDecimals]: {
    labeled: {
      en: '{label} can have at most 2 digits after the decimal point, like 12.50.',
      bn: '{label}-এ দশমিকের পরে সর্বোচ্চ 2টি সংখ্যা দিন, যেমন 12.50।',
    },
    unlabeled: {
      en: 'Use at most 2 digits after the decimal point, like 12.50.',
      bn: 'দশমিকের পরে সর্বোচ্চ 2টি সংখ্যা দিন, যেমন 12.50।',
    },
  },
  [FieldProblemCode.InvalidFormat]: {
    labeled: {
      en: "{label} isn't in the right format. Please check it.",
      bn: '{label} সঠিক ফরম্যাটে নেই। আবার চেক করুন।',
    },
    unlabeled: {
      en: "This isn't in the right format. Please check it.",
      bn: 'এটি সঠিক ফরম্যাটে নেই। আবার চেক করুন।',
    },
  },
  [FieldProblemCode.InvalidEmail]: same({
    en: 'Enter a valid email address, like name@example.com.',
    bn: 'একটি সঠিক ইমেইল অ্যাড্রেস দিন, যেমন name@example.com।',
  }),
  [FieldProblemCode.InvalidUrl]: same({
    en: 'Enter a full web address that starts with https://.',
    bn: 'https:// দিয়ে শুরু হওয়া পুরো ওয়েব অ্যাড্রেস দিন।',
  }),
  [FieldProblemCode.InvalidDate]: {
    labeled: { en: "{label} isn't a valid date.", bn: '{label} সঠিক তারিখ নয়।' },
    unlabeled: { en: "This isn't a valid date.", bn: 'এটি সঠিক তারিখ নয়।' },
  },
  [FieldProblemCode.NotAllowed]: {
    labeled: {
      en: "{label} isn't one of the available choices.",
      bn: '{label} দেওয়া অপশনগুলোর মধ্যে নেই।',
    },
    unlabeled: {
      en: "This isn't one of the available choices.",
      bn: 'এটি দেওয়া অপশনগুলোর মধ্যে নেই।',
    },
  },
  [FieldProblemCode.WrongType]: {
    labeled: {
      en: "{label} isn't valid. Please check it.",
      bn: '{label} সঠিক নয়। আবার চেক করুন।',
    },
    unlabeled: { en: "This isn't valid. Please check it.", bn: 'এটি সঠিক নয়। আবার চেক করুন।' },
  },
  [FieldProblemCode.NothingToChange]: same({
    en: 'Change something before saving.',
    bn: 'সেভ করার আগে কিছু পরিবর্তন করুন।',
  }),
};

// "More than 0" rather than "at least 0": the limit itself is not allowed.
const EXCLUSIVE_TEMPLATES: Readonly<Partial<Record<FieldProblemCode, Template>>> = {
  [FieldProblemCode.TooSmall]: {
    labeled: { en: '{label} must be more than {min}.', bn: '{label} {min}-এর বেশি হতে হবে।' },
    unlabeled: { en: 'This must be more than {min}.', bn: 'এটি {min}-এর বেশি হতে হবে।' },
  },
  [FieldProblemCode.TooLarge]: {
    labeled: { en: '{label} must be less than {max}.', bn: '{label} {max}-এর কম হতে হবে।' },
    unlabeled: { en: 'This must be less than {max}.', bn: 'এটি {max}-এর কম হতে হবে।' },
  },
};

const PHONE_FORMAT: Translation = {
  en: 'Enter a Bangladeshi mobile number, such as 017XXXXXXXX.',
  bn: 'একটি বাংলাদেশি মোবাইল নম্বর দিন, যেমন 017XXXXXXXX।',
};
const CODE_FORMAT: Translation = {
  en: `Enter the ${String(CODE_LENGTH)}-digit code.`,
  bn: `${String(CODE_LENGTH)} সংখ্যার কোডটি দিন।`,
};

/** Where a field needs more than the general message to be fixed -- an example of the right format. */
const FIELD_MESSAGES: Readonly<Record<string, Partial<Record<FieldProblemCode, Translation>>>> = {
  phone: { [FieldProblemCode.InvalidFormat]: PHONE_FORMAT },
  contactPhone: { [FieldProblemCode.InvalidFormat]: PHONE_FORMAT },
  code: {
    [FieldProblemCode.InvalidFormat]: CODE_FORMAT,
    [FieldProblemCode.WrongLength]: CODE_FORMAT,
  },
  address: {
    [FieldProblemCode.InvalidFormat]: {
      en: 'Use only small English letters (a-z), numbers and hyphens, like fashion-house.',
      bn: 'শুধু ছোট হাতের ইংরেজি অক্ষর (a-z), সংখ্যা আর হাইফেন দিন, যেমন fashion-house।',
    },
  },
};

const SUMMARY: Readonly<Record<'none' | 'several', Translation>> = {
  none: {
    en: 'Please check the information you entered.',
    bn: 'অনুগ্রহ করে দেওয়া তথ্য চেক করুন।',
  },
  several: {
    en: '{count} fields need fixing. Check the highlighted fields.',
    bn: '{count}টি ফিল্ড ঠিক করতে হবে। হাইলাইট করা ফিল্ডগুলো চেক করুন।',
  },
};

function fill(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);
}

/** The field's own name, from the last part of its path that is not a list position (`items.0.name` -> `name`). */
function nameOf(field: string): string {
  return (
    field
      .split('.')
      .filter((part) => !/^\d+$/.test(part))
      .pop() ?? ''
  );
}

/** API-16: the message a person sees for one field problem, in their language. */
export function fieldProblemMessage(problem: FieldProblem, language: Language): string {
  const name = nameOf(problem.field);
  const values: Record<string, string> = {};
  if (problem.min !== undefined) values['min'] = String(problem.min);
  if (problem.max !== undefined) values['max'] = String(problem.max);
  if (problem.length !== undefined) values['length'] = String(problem.length);

  const specific = FIELD_MESSAGES[name]?.[problem.problem];
  if (specific) return fill(specific[language], values);

  const template =
    (problem.exclusive === true ? EXCLUSIVE_TEMPLATES[problem.problem] : undefined) ??
    TEMPLATES[problem.problem];
  const label = FIELD_LABELS[name];
  if (!label) return fill(template.unlabeled[language], values);
  return fill(template.labeled[language], { ...values, label: label[language] });
}

/** Each problem with its message, in one language. */
export function fieldErrorsOf(problems: readonly FieldProblem[], language: Language): FieldError[] {
  return problems.map((problem) => ({
    ...problem,
    message: fieldProblemMessage(problem, language),
  }));
}

/**
 * The message for a failed request as a whole: the one field's own message when only one failed, so the
 * person reads exactly what to fix; a count when several did, each of which carries its own message.
 */
export function validationSummary(errors: readonly FieldError[], language: Language): string {
  const [only, ...rest] = errors;
  if (!only) return SUMMARY.none[language];
  if (rest.length === 0) return only.message;
  return fill(SUMMARY.several[language], { count: String(errors.length) });
}
