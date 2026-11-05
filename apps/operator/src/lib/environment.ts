export type ConsoleEnvironment = 'production' | 'staging' | 'local';

/** Which deployment this console is, for the top bar's chip. From the address, so it can't be set wrongly. */
export function environmentOf(hostname: string): ConsoleEnvironment {
  if (hostname === 'admin.lytro.app') return 'production';
  return hostname.includes('staging') ? 'staging' : 'local';
}
