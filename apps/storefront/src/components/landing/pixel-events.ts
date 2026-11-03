'use client';

// LND-15, LND-18: the landing page's own events, told to the shop's Meta Pixel. The Pixel loads only after the page is
// idle, so an event raised before then waits for it; with no Pixel connected, they wait for nothing and no code loads.
// A tracking failure never touches the page or the order.
const waiting: unknown[][] = [];

export function pixelEvent(...call: unknown[]): void {
  try {
    if (window.fbq) window.fbq(...call);
    else waiting.push(call);
  } catch {
    // LND-18.
  }
}

/** Once the Pixel is up: tells it whatever was raised before. */
export function flushPixelEvents(): void {
  try {
    for (const call of waiting.splice(0)) window.fbq?.(...call);
  } catch {
    // LND-18.
  }
}
