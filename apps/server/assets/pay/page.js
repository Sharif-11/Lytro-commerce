/* global document, window, fetch, navigator, URLSearchParams */
// PAYMENT-PAGE-DESIGN §6: the page's small script. The page works without it: forms post, sheets open by the address, and
// a waiting page refreshes itself. This adds the copy buttons, the running clocks, checking every 3 seconds, and going on.
const CHECK_EVERY_MS = 3000;
const RETURN_AFTER_MS = 5000;
const HAND_OVER_AFTER_MS = 300;

function twoDigits(value) {
  return String(value).padStart(2, '0');
}

/** PAY-03, PAY-05: the time left runs down; at the end the server says what happened. */
function runCountdowns() {
  const clocks = document.querySelectorAll('[data-expires]');
  if (clocks.length === 0) return;
  const tick = () => {
    clocks.forEach((clock) => {
      const left = Math.max(Math.floor((Date.parse(clock.dataset.expires) - Date.now()) / 1000), 0);
      clock.textContent = `${twoDigits(Math.floor(left / 60))}:${twoDigits(left % 60)}`;
      if (left === 0) window.location.reload();
    });
  };
  window.setInterval(tick, 1000);
}

/** PAY-17: the ring counts the 30 seconds since the ID was typed. */
function runRing() {
  const ring = document.querySelector('[data-typed]');
  if (!ring) return;
  const circle = ring.querySelector('.fg');
  const label = ring.querySelector('.t');
  window.setInterval(() => {
    const seconds = Math.max(Math.floor((Date.now() - Date.parse(ring.dataset.typed)) / 1000), 0);
    label.textContent = `${seconds}s`;
    circle.setAttribute(
      'stroke-dashoffset',
      String(Math.round((201 * Math.min(seconds, 30)) / 30)),
    );
  }, 1000);
}

/** PAY-17: a page waiting on someone else asks every 3 seconds, and reloads once the server would draw another screen. */
function runChecking() {
  const { poll, ref, screen } = document.body.dataset;
  if (!poll || !ref) return;
  const check = async () => {
    try {
      const answer = await fetch(`/${ref}/status${window.location.search}`, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!answer.ok) return;
      const now = await answer.json();
      if (now.screen === screen) return;
      const query = new URLSearchParams(window.location.search);
      query.set('just', '1');
      query.delete('change');
      window.location.replace(`/${ref}?${query.toString()}`);
    } catch {
      // Offline for a moment: the next check will do.
    }
  };
  window.setInterval(() => void check(), CHECK_EVERY_MS);
}

/** PAY-05: copying a number copies exactly it. */
function runCopyButtons() {
  const toast = document.getElementById('copied');
  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', () => {
      void navigator.clipboard.writeText(button.dataset.copy).then(() => {
        if (!toast) return;
        toast.textContent = button.dataset.copied;
        toast.hidden = false;
        window.setTimeout(() => {
          toast.hidden = true;
        }, 3000);
      });
    });
  });
}

/** PAY-06: a wallet on automated goes straight on, so the handing-over screen sends itself, once it has been drawn. */
function runHandOver() {
  const form = document.querySelector('form[data-auto]');
  if (form) {
    window.setTimeout(() => {
      form.submit();
    }, HAND_OVER_AFTER_MS);
  }
}

/** PAY-08: a verified payment goes back to the shop by itself. */
function runReturn() {
  const address = document.body.dataset.return;
  if (address) {
    window.setTimeout(() => {
      window.location.replace(address);
    }, RETURN_AFTER_MS);
  }
}

runCountdowns();
runRing();
runChecking();
runCopyButtons();
runHandOver();
runReturn();
