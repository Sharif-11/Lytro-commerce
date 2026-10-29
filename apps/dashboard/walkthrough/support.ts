import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';

// Slice 11.13b: what the walkthrough and its setup share -- where the real server listens and logs, the phone code
// read from that log, and the checks every screen of the walkthrough passes.

/** The walkthrough's own server, beside a developer's on 3000. */
export const SERVER_PORT = 3100;
/** The built dashboard, beside the mocked suite's 4173. */
export const DASHBOARD_PORT = 4174;
/** The server's output: in development its SMS stub prints every message there (D6). */
export const SERVER_LOG = resolve(
  import.meta.dirname,
  '../test-results/walkthrough-server/server.log',
);

/** A Bangladeshi mobile number no earlier run has used, as the sign-in field takes it (no leading 0). */
export function freshPhone(): string {
  return `171${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
}

/** The last code the server sent to this number, read from its log once it is there. */
export async function codeFor(phone: string): Promise<string> {
  let code = '';
  await expect
    .poll(() => {
      const lines = readFileSync(SERVER_LOG, 'utf8').split('\n');
      const sent = lines.filter((line) => line.includes('[sms-stub]') && line.includes(phone));
      code = /\b(\d{6})\b/.exec(sent.at(-1) ?? '')?.[1] ?? '';
      return code;
    })
    .not.toBe('');
  return code;
}

/** Types a code into the six boxes, as a person does. */
export async function typeCode(page: Page, code: string): Promise<void> {
  await page.getByRole('textbox', { name: /1\/6$/ }).click();
  await page.keyboard.type(code);
}
