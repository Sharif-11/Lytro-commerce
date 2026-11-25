import { messengerChatLinkOf, phoneShown, whatsAppChatLinkOf } from '@lytronix/validators';
import type { PublicShop } from '@/lib/api/storefront-api';

/** One way to reach the shop: where it opens, and how it reads. */
export interface ChatLink {
  href: string;
  label: string;
}

/** SFT-21 (UI/UX batch 2, 2.2): the chats a shop set -- each null when unset, so nothing shows for it. */
export interface ShopChat {
  whatsapp: ChatLink | null;
  messenger: ChatLink | null;
  facebook: ChatLink | null;
}

/** The shop's chats from its contact details (the public API's `shop.contact`). */
export function shopChatOf(contact: PublicShop['contact']): ShopChat {
  const whatsapp = contact.whatsapp ?? null;
  const messenger = contact.messenger ?? null;
  const facebook = contact.facebookPage ?? null;
  return {
    whatsapp: whatsapp ? { href: whatsAppChatLinkOf(whatsapp), label: phoneShown(whatsapp) } : null,
    messenger: messenger
      ? { href: messengerChatLinkOf(messenger), label: `m.me/${messenger}` }
      : null,
    facebook: facebook
      ? { href: facebook, label: facebook.replace(/^https?:\/\/(?:www\.)?/i, '') }
      : null,
  };
}
