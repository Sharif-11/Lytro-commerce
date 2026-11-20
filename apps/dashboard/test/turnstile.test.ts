import { describe, expect, it, vi } from 'vitest';
import { AppConfig } from '../src/lib/app-config';
import {
  HumanCheckWidget,
  NO_HUMAN_CHECK,
  TURNSTILE_SCRIPT_URL,
  TurnstileScript,
  type TurnstileApi,
  withToken,
} from '../src/lib/turnstile';

// SUP-08, SMS-11, AUTH-09 as amended 2026-11-20: Cloudflare's Turnstile widget on every form that texts a code, one
// token per request. Cloudflare's script is faked here as it behaves (developers.cloudflare.com/turnstile).

type Options = Parameters<TurnstileApi['render']>[1];

/** Cloudflare's `window.turnstile`, driven by the test. */
class FakeTurnstile implements TurnstileApi {
  rendered: Options[] = [];
  resets = 0;
  removed = 0;

  render(_container: HTMLElement, options: Options): string {
    this.rendered.push(options);
    return 'widget-1';
  }

  reset(): void {
    this.resets += 1;
  }

  remove(): void {
    this.removed += 1;
  }

  get options(): Options {
    const last = this.rendered.at(-1);
    if (last === undefined) throw new Error('nothing rendered');
    return last;
  }
}

function widgetOn(api: FakeTurnstile, waitMs?: number, onTap?: (wanted: boolean) => void) {
  return new HumanCheckWidget(api, document.createElement('div'), {
    siteKey: '1x00000000000000000000AA',
    action: 'signin',
    waitMs,
    onTap,
  });
}

describe('the bot check on forms that text a code', () => {
  it('draws one widget, out of sight unless Cloudflare wants a tap, for the request it guards', () => {
    const api = new FakeTurnstile();
    widgetOn(api);
    expect(api.rendered).toHaveLength(1);
    expect(api.options).toMatchObject({
      sitekey: '1x00000000000000000000AA',
      action: 'signin',
      appearance: 'interaction-only',
    });
  });

  it('hands out the token once Cloudflare gives it, and a request sent sooner waits for it', async () => {
    const api = new FakeTurnstile();
    const widget = widgetOn(api);
    const early = widget.next();
    api.options.callback('token-1');
    await expect(early).resolves.toBe('token-1');
    await expect(widget.next()).resolves.toBe('token-1');
  });

  it('spends the token after each request: the widget is reset and the next request waits for a new one', async () => {
    const api = new FakeTurnstile();
    const widget = widgetOn(api);
    api.options.callback('token-1');
    widget.spent();
    expect(api.resets).toBe(1);
    const next = widget.next();
    api.options.callback('token-2');
    await expect(next).resolves.toBe('token-2');
  });

  it('sends no token when Cloudflare fails, the token expires unused and none comes, or none comes in time', async () => {
    const api = new FakeTurnstile();
    const failing = widgetOn(api);
    const waiting = failing.next();
    api.options['error-callback']();
    await expect(waiting).resolves.toBeUndefined();
    await expect(failing.next()).resolves.toBeUndefined();

    vi.useFakeTimers();
    try {
      const slow = widgetOn(new FakeTurnstile(), 1000);
      const late = slow.next();
      vi.advanceTimersByTime(1001);
      await expect(late).resolves.toBeUndefined();

      const expiring = new FakeTurnstile();
      const widget = widgetOn(expiring, 1000);
      expiring.options.callback('token-1');
      expiring.options['expired-callback']();
      const after = widget.next();
      vi.advanceTimersByTime(1001);
      await expect(after).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('says when Cloudflare wants a tap and when it has it, so the form shows the box only then', () => {
    const api = new FakeTurnstile();
    const taps: boolean[] = [];
    widgetOn(api, undefined, (wanted) => taps.push(wanted));
    api.options['before-interactive-callback']();
    api.options['after-interactive-callback']();
    expect(taps).toEqual([true, false]);
  });

  it('removes its widget when the form goes, answering any request still waiting', async () => {
    const api = new FakeTurnstile();
    const widget = widgetOn(api);
    const waiting = widget.next();
    widget.remove();
    await expect(waiting).resolves.toBeUndefined();
    expect(api.removed).toBe(1);
  });

  it('with no widget, a request goes without a token, as before', async () => {
    await expect(NO_HUMAN_CHECK.next()).resolves.toBeUndefined();
    expect(withToken({ phone: '+8801711234567' }, undefined)).toEqual({ phone: '+8801711234567' });
    expect(withToken({ phone: '+8801711234567' }, 't')).toEqual({
      phone: '+8801711234567',
      turnstileToken: 't',
    });
  });
});

describe("Cloudflare's script", () => {
  it('is added once for the page, explicitly rendered, however many forms ask', async () => {
    const doc = document.implementation.createHTMLDocument('page');
    const win = {} as Window;
    const script = new TurnstileScript(doc, win);
    const first = script.load();
    const second = script.load();
    const tags = doc.head.querySelectorAll('script');
    expect(tags).toHaveLength(1);
    expect(tags[0]?.src).toBe(TURNSTILE_SCRIPT_URL);
    const api = new FakeTurnstile();
    win.turnstile = api;
    tags[0]?.dispatchEvent(new Event('load'));
    await expect(first).resolves.toBe(api);
    await expect(second).resolves.toBe(api);
  });

  it('that failed to load is tried again by the next form', async () => {
    const doc = document.implementation.createHTMLDocument('page');
    const script = new TurnstileScript(doc, {} as Window);
    const failed = script.load();
    doc.head.querySelector('script')?.dispatchEvent(new Event('error'));
    await expect(failed).rejects.toThrow('turnstile did not load');
    void script.load().catch(() => undefined);
    expect(doc.head.querySelectorAll('script')).toHaveLength(2);
  });
});

describe('the site key comes from the build', () => {
  it('is read from VITE_TURNSTILE_SITE_KEY, and absent means no widget', () => {
    expect(new AppConfig({} as ImportMetaEnv, 'app.lytro.app').turnstileSiteKey).toBeNull();
    expect(
      new AppConfig({ VITE_TURNSTILE_SITE_KEY: ' ' } as ImportMetaEnv, 'app.lytro.app')
        .turnstileSiteKey,
    ).toBeNull();
    expect(
      new AppConfig(
        { VITE_TURNSTILE_SITE_KEY: '0x4AAAAAAA-site-key' } as ImportMetaEnv,
        'app.lytro.app',
      ).turnstileSiteKey,
    ).toBe('0x4AAAAAAA-site-key');
  });
});
