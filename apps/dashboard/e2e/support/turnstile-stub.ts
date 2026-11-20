import type { Page, Route } from '@playwright/test';

// SUP-08, SMS-11, AUTH-09 as amended 2026-11-20: Cloudflare's Turnstile script as the browser tests answer it, so no
// test reaches Cloudflare. CI builds the dashboard with Cloudflare's always-passes test site key (ci.yml), so every
// form that texts a code draws this widget. It gives `stub-token-<n>` at once, a new one after each reset; with
// `window.__turnstileTap` set, it first asks for a tap on a "Verify you are human" button, as Cloudflare does when it
// isn't sure. Each render's settings are kept in `window.__turnstileRendered`.
const STUB = `(() => {
  let issued = 0;
  const widgets = new Map();
  window.__turnstileRendered = [];
  const issue = (id) => {
    const widget = widgets.get(id);
    if (!widget) return;
    issued += 1;
    const token = 'stub-token-' + issued;
    if (!window.__turnstileTap) {
      setTimeout(() => widget.options.callback(token), 0);
      return;
    }
    widget.options['before-interactive-callback']();
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Verify you are human';
    button.onclick = () => {
      button.remove();
      widget.options['after-interactive-callback']();
      widget.options.callback(token);
    };
    widget.container.appendChild(button);
  };
  window.turnstile = {
    render(container, options) {
      const id = 'widget-' + (widgets.size + 1);
      widgets.set(id, { container, options });
      window.__turnstileRendered.push({
        sitekey: options.sitekey,
        action: options.action,
        appearance: options.appearance,
      });
      issue(id);
      return id;
    },
    reset(id) {
      issue(id);
    },
    remove(id) {
      widgets.delete(id);
    },
  };
})();`;

export async function stubTurnstile(page: Page): Promise<void> {
  await page.route('https://challenges.cloudflare.com/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }),
  );
}
