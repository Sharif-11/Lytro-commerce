import { readFileSync } from 'node:fs';

const CODE_LINE = /\[sms-stub] to (\d+): .*?code is (\d{6})/g;

/** Reads the most recent OTP/reset code the backend "sent" to this phone, from its own stub-SMS log file
    (ConsoleSmsProvider's console line, redirected to a file — see backend.ts). Polls briefly: the HTTP
    response that triggered the send can return a moment before the line is actually flushed to disk. */
export async function codeFor(logFile: string, phone: string): Promise<string> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const text = readFileSync(logFile, 'utf-8');
    let match: RegExpExecArray | null;
    let latest: string | null = null;
    CODE_LINE.lastIndex = 0;
    while ((match = CODE_LINE.exec(text)) !== null) {
      if (match[1] === phone) latest = match[2] ?? null;
    }
    if (latest !== null) return latest;
    if (Date.now() > deadline) {
      throw new Error(`no code for ${phone} appeared in ${logFile} within 5s`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
