// AUTH-28/29: what the guest brought from the marketing site — a claimed shop address (`?shop=`) and a plan
// with its term (`?planId=&termId=`) — kept through step 1 whichever identity path verifies them (phone code,
// password, Google, Facebook). Captured once at /sign-in, the one entry door; read at create-shop and the
// checkout; cleared once the checkout or the password step is passed.
const STORAGE_KEY = 'lytro.sign-up-intent';

export interface SignUpIntent {
  shop: string | null;
  planId: string | null;
  termId: string | null;
}

const EMPTY: SignUpIntent = { shop: null, planId: null, termId: null };

export class SignUpIntentStore {
  constructor(private readonly storage: Storage | null = SignUpIntentStore.sessionStorage()) {}

  /** Merges what the URL carries into what is already held, so a plan picked earlier survives a later
      sign-in link that carries only the shop (and the other way round). */
  capture(fromSearch: Partial<SignUpIntent>): SignUpIntent {
    const current = this.read();
    const next: SignUpIntent = {
      shop: fromSearch.shop ?? current.shop,
      planId: fromSearch.planId ?? current.planId,
      termId: fromSearch.termId ?? current.termId,
    };
    this.write(next);
    return next;
  }

  read(): SignUpIntent {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (!raw) return EMPTY;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return EMPTY;
      const value = parsed as Record<string, unknown>;
      return {
        shop: typeof value.shop === 'string' ? value.shop : null,
        planId: typeof value.planId === 'string' ? value.planId : null,
        termId: typeof value.termId === 'string' ? value.termId : null,
      };
    } catch {
      return EMPTY;
    }
  }

  /** The plan half is consumed once the checkout opens; the claimed address once the shop exists. */
  clearPlan(): void {
    const current = this.read();
    this.write({ ...current, planId: null, termId: null });
  }

  clearShop(): void {
    const current = this.read();
    this.write({ ...current, shop: null });
  }

  clear(): void {
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
  }

  private write(value: SignUpIntent): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Without storage the intent lives only as long as this page.
    }
  }

  private static sessionStorage(): Storage | null {
    try {
      return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    } catch {
      return null;
    }
  }
}

export const signUpIntent = new SignUpIntentStore();
