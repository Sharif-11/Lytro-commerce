// SUP-08, SMS-11, AUTH-09 as amended 2026-11-20 (the owner's "Raise them + bot check"): every request that texts a code
// -- sign-up and sign-in by code, a reset and its resend -- carries a token from Cloudflare's Turnstile widget, which
// the server checks with Cloudflare (HumanCheck). The widget's site key is baked in at build (VITE_TURNSTILE_SITE_KEY,
// deploy.yml's DASHBOARD_TURNSTILE_SITE_KEY); without one there is no widget and no token, as before. The widget stays
// out of sight unless Cloudflare wants a tap. Cloudflare's script is allowed by the dashboard's CSP (deploy/Caddyfile).

export const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** What the token is for, as the server checks it (apps/server/.../human-check.ts). */
export type HumanCheckAction = 'signin' | 'reset';

// A person may need to tap the widget before a token comes; past this, the request goes without one and the server says
// to reload.
export const TOKEN_WAIT_MS = 60_000;

interface TurnstileRenderOptions {
  sitekey: string;
  action: HumanCheckAction;
  appearance: 'interaction-only';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
  'before-interactive-callback': () => void;
  'after-interactive-callback': () => void;
}

/** The part of Cloudflare's `window.turnstile` the dashboard uses. */
export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Cloudflare's script, loaded once for the page, however many forms ask. */
export class TurnstileScript {
  private loading: Promise<TurnstileApi> | null = null;

  constructor(
    private readonly doc: Document = document,
    private readonly win: Window = window,
  ) {}

  load(): Promise<TurnstileApi> {
    this.loading ??= new Promise<TurnstileApi>((resolve, reject) => {
      const ready = this.win.turnstile;
      if (ready !== undefined) {
        resolve(ready);
        return;
      }
      const script = this.doc.createElement('script');
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.addEventListener('load', () => {
        const api = this.win.turnstile;
        if (api === undefined) reject(new Error('turnstile did not load'));
        else resolve(api);
      });
      script.addEventListener('error', () => {
        reject(new Error('turnstile did not load'));
      });
      this.doc.head.appendChild(script);
    }).catch((error: unknown) => {
      // A page that couldn't load it tries again on the next form.
      this.loading = null;
      throw error;
    });
    return this.loading;
  }
}

/** Hands a request its token: one per request, since Cloudflare takes each only once. */
export interface HumanCheckTokens {
  /** The token for the next request, waiting while Cloudflare decides (or for a tap); none when there is no widget. */
  next(): Promise<string | undefined>;
  /** Called after each request, whatever its answer: the token is spent, and the widget fetches a fresh one. */
  spent(): void;
}

/** No widget (no site key, or before it renders): requests go without a token, as before the amendment. */
export const NO_HUMAN_CHECK: HumanCheckTokens = {
  next: () => Promise.resolve(undefined),
  spent: () => undefined,
};

/** How one form's widget is drawn. */
export interface HumanCheckWidgetOptions {
  siteKey: string;
  action: HumanCheckAction;
  /** Told when Cloudflare wants a tap (true) and when it has it (false), so the form shows the widget only then. */
  onTap?: (wanted: boolean) => void;
  waitMs?: number;
  timers?: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;
}

/** One widget on one form. */
export class HumanCheckWidget implements HumanCheckTokens {
  private readonly id: string | undefined;
  private readonly waitMs: number;
  private readonly timers: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;
  private token: string | null = null;
  private failed = false;
  private waiting: ((token: string | undefined) => void)[] = [];

  constructor(
    private readonly api: TurnstileApi,
    container: HTMLElement,
    options: HumanCheckWidgetOptions,
  ) {
    this.waitMs = options.waitMs ?? TOKEN_WAIT_MS;
    this.timers = options.timers ?? globalThis;
    const tap = options.onTap ?? (() => undefined);
    this.id = api.render(container, {
      sitekey: options.siteKey,
      action: options.action,
      appearance: 'interaction-only',
      callback: (token) => {
        this.failed = false;
        this.token = token;
        this.answer(token);
      },
      'expired-callback': () => {
        this.token = null;
      },
      'error-callback': () => {
        // Cloudflare couldn't decide (blocked, offline): the request goes without, and the server says to reload.
        this.failed = true;
        this.token = null;
        this.answer(undefined);
      },
      'before-interactive-callback': () => {
        tap(true);
      },
      'after-interactive-callback': () => {
        tap(false);
      },
    });
  }

  next(): Promise<string | undefined> {
    if (this.token !== null) return Promise.resolve(this.token);
    if (this.failed || this.id === undefined) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const timer = this.timers.setTimeout(() => {
        this.waiting = this.waiting.filter((waiter) => waiter !== settle);
        resolve(undefined);
      }, this.waitMs);
      const settle = (token: string | undefined): void => {
        this.timers.clearTimeout(timer);
        resolve(token);
      };
      this.waiting.push(settle);
    });
  }

  spent(): void {
    this.token = null;
    this.failed = false;
    if (this.id !== undefined) this.api.reset(this.id);
  }

  remove(): void {
    this.answer(undefined);
    if (this.id !== undefined) this.api.remove(this.id);
  }

  private answer(token: string | undefined): void {
    const waiting = this.waiting;
    this.waiting = [];
    for (const settle of waiting) settle(token);
  }
}

/** A request's body field, sent only when there is a token. */
export function withToken<T extends object>(
  body: T,
  token: string | undefined,
): T & { turnstileToken?: string } {
  return token === undefined ? body : { ...body, turnstileToken: token };
}
