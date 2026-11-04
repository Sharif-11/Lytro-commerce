export type NextStep =
  'verify-phone' | 'create-shop' | 'dashboard' | 'set-password' | 'renewal' | 'unavailable';

export interface SignedIn {
  next: NextStep;
  tenantId: string | null;
  cookie: string;
  csrfToken: string;
}
