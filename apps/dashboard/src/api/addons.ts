import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BuyPacksInput,
  ConfirmAddonInput,
  QuoteAddonInput,
  SetPackAutoBuyInput,
} from '@lytronix/validators';
import { BALANCE_QUERY_KEY, LEDGER_QUERY_KEY } from '@/api/balance';
import { HOME_QUERY_KEY } from '@/api/home';
import { PAYMENTS_QUERY_KEY } from '@/api/payment-keys';
import { USAGE_QUERY_KEY } from '@/api/usage';
import { tenantSession } from '@/session/tenant-session';
import type { AddonOffer, AddonPurchaseResult, AddonQuote, ShopAddons } from '@/types/addons';

export const ADDONS_QUERY_KEY = ['addons'] as const;
const MINE_QUERY_KEY = [...ADDONS_QUERY_KEY, 'mine'] as const;

/** PLN-13, PLN-14: what is for sale to the shop and what it costs now -- the names in both languages too. */
export function useAddonOffers() {
  return useQuery({
    queryKey: ADDONS_QUERY_KEY,
    queryFn: () => tenantSession.client.get<AddonOffer[]>('/addons'),
  });
}

/** PLN-14, BRN-05, PLN-15: what the shop has now, how each renews, and its packs. */
export function useShopAddons() {
  return useQuery({
    queryKey: MINE_QUERY_KEY,
    queryFn: () => tenantSession.client.get<ShopAddons>('/addons/mine'),
  });
}

/** After money moved: what the shop has, its limits, its balance and its payments, read again. */
function useAfterPayment(): () => void {
  const queryClient = useQueryClient();
  return () => {
    for (const queryKey of [
      ADDONS_QUERY_KEY,
      USAGE_QUERY_KEY,
      BALANCE_QUERY_KEY,
      LEDGER_QUERY_KEY,
      PAYMENTS_QUERY_KEY,
      HOME_QUERY_KEY,
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}

/** BIL-09: the request for an add-on, made on the tap that commits, with the amount shown and the renewal switch. */
export function useQuoteAddon() {
  return useMutation({
    mutationFn: (input: QuoteAddonInput) =>
      tenantSession.client.post<AddonQuote>('/addons/quote', input),
  });
}

/** BIL-08, BIL-02: pays the request from the balance, or sends the wallet payment to be checked. */
export function usePurchaseAddon() {
  const after = useAfterPayment();
  return useMutation({
    mutationFn: (input: ConfirmAddonInput) =>
      tenantSession.client.post<AddonPurchaseResult>('/addons/purchase', input),
    onSuccess: after,
  });
}

/** PLN-15: packs from the balance at once, with the amount shown. */
export function useBuyPacks() {
  const after = useAfterPayment();
  return useMutation({
    mutationFn: (input: BuyPacksInput) =>
      tenantSession.client.post<AddonPurchaseResult>('/addons/packs', input),
    onSuccess: after,
  });
}

/** PLN-14: an add-on's renewal switch. */
export function useSetAddonRenewal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, renews }: { id: string; renews: boolean }) =>
      tenantSession.client.patch<ShopAddons>(`/addons/mine/${id}`, { renews }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADDONS_QUERY_KEY });
    },
  });
}

/** PLN-15: the auto-buy switches, either or both; the usage page and the add-ons read them again. */
export function useSetAutoBuy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetPackAutoBuyInput) =>
      tenantSession.client.patch('/addons/auto-buy', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USAGE_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ADDONS_QUERY_KEY });
    },
  });
}
