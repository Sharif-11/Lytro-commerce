// I18N-01: every message is written in Bangla and English; Bangla is the platform default.
export type Language = 'bn' | 'en';

/** One piece of copy in both languages. */
export interface Translation {
  en: string;
  bn: string;
}

/**
 * API-16: why one request field failed, as a stable code a client can rely on. The person sees the message
 * written for it (`fieldProblemMessage`), never the code.
 */
export enum FieldProblemCode {
  Required = 'required',
  TooShort = 'too_short',
  TooLong = 'too_long',
  WrongLength = 'wrong_length',
  TooSmall = 'too_small',
  TooLarge = 'too_large',
  TooFew = 'too_few',
  TooMany = 'too_many',
  NotANumber = 'not_a_number',
  NotWholeNumber = 'not_whole_number',
  TooManyDecimals = 'too_many_decimals',
  InvalidFormat = 'invalid_format',
  InvalidEmail = 'invalid_email',
  InvalidUrl = 'invalid_url',
  InvalidDate = 'invalid_date',
  NotAllowed = 'not_allowed',
  WrongType = 'wrong_type',
  NothingToChange = 'nothing_to_change',
}

/**
 * API-16: problems only the server can find, by looking at stored data -- an address someone else has, a code
 * that ran out. The server words these itself; a client can rely on the code like any other.
 */
export enum ServerFieldProblemCode {
  Taken = 'taken',
  AlreadyUsed = 'already_used',
  Incorrect = 'incorrect',
  Expired = 'expired',
  NotFound = 'not_found',
  OutOfRange = 'out_of_range',
}

/**
 * One failed field: which (`field`, a dotted path such as `items.0.name`; empty for the request as a whole),
 * why, and the limit it broke. Language-free, so it can travel in an API error and be worded on either side.
 */
export interface FieldProblem {
  field: string;
  problem: FieldProblemCode;
  min?: number;
  max?: number;
  length?: number;
  /** For too_small and too_large: the limit itself is not allowed ("more than 0", not "at least 0"). */
  exclusive?: boolean;
}

/** A field problem with its message, in one language. */
export interface FieldError extends FieldProblem {
  message: string;
}
