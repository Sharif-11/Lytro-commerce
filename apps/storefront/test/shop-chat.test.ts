import { describe, expect, it } from 'vitest';
import { shopChatOf } from '../src/lib/shop/shop-chat';

// SFT-21 (UI/UX batch 2, 2.2): the chat links a shop's contact details make, and how each reads.
describe('shopChatOf', () => {
  it('links WhatsApp, Messenger and the Facebook page, each read the way a person says it', () => {
    expect(
      shopChatOf({
        phone: null,
        email: null,
        address: null,
        whatsapp: '01711223344',
        messenger: 'megh.fashion',
        facebookPage: 'https://www.facebook.com/meghfashion',
      }),
    ).toEqual({
      whatsapp: { href: 'https://wa.me/8801711223344', label: '01711223344' },
      messenger: { href: 'https://m.me/megh.fashion', label: 'm.me/megh.fashion' },
      facebook: {
        href: 'https://www.facebook.com/meghfashion',
        label: 'facebook.com/meghfashion',
      },
    });
  });

  it('gives nothing for a chat the shop never set, or an older server that never sends one', () => {
    const none = { whatsapp: null, messenger: null, facebook: null };
    expect(shopChatOf({ phone: '01711223344', email: null, address: null })).toEqual(none);
    expect(
      shopChatOf({
        phone: null,
        email: null,
        address: null,
        whatsapp: null,
        messenger: null,
        facebookPage: null,
      }),
    ).toEqual(none);
  });
});
