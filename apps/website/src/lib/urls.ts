// Every link into the dashboard host is built here, so the sign-up address, the claimed shop and a plan
// picked on pricing (AUTH-28, AUTH-29) are carried the same way from every button on the site. The query
// names are the ones the dashboard's sign-in route validates (`planId`, `termId`, `mode`).

export interface SignInContext {
  shop?: string;
  planId?: string;
  termId?: string;
}

export class AppUrls {
  constructor(private readonly appBase: string) {}

  /** The one entry door for new and returning sellers (AUTH-12). */
  signIn(context: SignInContext = {}): string {
    const params = new URLSearchParams();
    if (context.shop) params.set('shop', context.shop);
    if (context.planId) params.set('planId', context.planId);
    if (context.termId) params.set('termId', context.termId);
    const query = params.toString();
    return `${this.appBase}/sign-in${query ? `?${query}` : ''}`;
  }

  /** The same door opened on the password form, for a seller coming back: a code to an existing shop uses the
      shop's free SMS (AUTH-21), and the form still offers a code to one who never set a password. */
  logIn(): string {
    return `${this.appBase}/sign-in?mode=password`;
  }

  /** Staff have their own page on the same host (AUTH-31). */
  staffSignIn(): string {
    return `${this.appBase}/staff-sign-in`;
  }
}
