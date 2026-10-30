import { appConfig } from '@/lib/app-config';
import { useShell } from '@/shell/shell-context';

/**
 * The shop's address as its links show it (Slice 13): its own domain while that serves, its main address then, else
 * its Lytro address.
 */
export function useShopAddress(): { host: string; url: string } {
  const { slug, tenant } = useShell();
  const host = tenant.ownDomain ?? appConfig.shopHost(slug);
  return { host, url: `https://${host}` };
}
