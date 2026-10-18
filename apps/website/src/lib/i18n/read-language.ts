import { cookies } from 'next/headers';
import { type Language, LanguageCookie, languageCookie } from './language';

/** The visitor's language for this request, from the per-device cookie. Server components only. */
export class RequestLanguage {
  constructor(private readonly cookie: LanguageCookie) {}

  async read(): Promise<Language> {
    const store = await cookies();
    return this.cookie.parse(store.get(this.cookie.name)?.value);
  }
}

export const requestLanguage = new RequestLanguage(languageCookie);
