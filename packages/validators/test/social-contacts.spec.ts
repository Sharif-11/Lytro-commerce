import { describe, expect, it } from 'vitest';
import {
  facebookPageField,
  facebookPageUrlOf,
  messengerChatLinkOf,
  messengerUsernameField,
  messengerUsernameOf,
  whatsAppChatLinkOf,
  whatsAppNumberField,
} from '../src/common/social-contacts';

// TEN-30, SFT-21 (UI/UX batch 2, 2.1/2.2): a shop's chat contacts are kept in one form, so the storefront builds each
// link one way.
describe('messengerUsernameOf', () => {
  it('takes the username from a bare name, an @name or a pasted link', () => {
    for (const typed of [
      'megh.fashion',
      '@megh.fashion',
      'm.me/megh.fashion',
      'https://m.me/megh.fashion/?ref=page',
      'www.messenger.com/t/megh.fashion',
      'https://www.facebook.com/megh.fashion',
      'fb.com/megh.fashion#top',
    ]) {
      expect(messengerUsernameOf(typed), typed).toBe('megh.fashion');
    }
  });

  it('refuses a link with more path, a space, or nothing at all', () => {
    for (const typed of ['', 'm.me/', 'm.me/a/b', 'megh fashion', 'https://instagram.com/megh/x']) {
      expect(messengerUsernameOf(typed), typed).toBeNull();
    }
  });
});

describe('facebookPageUrlOf', () => {
  it('keeps a page as https://www.facebook.com/<page>, from any form of the link', () => {
    for (const typed of [
      'facebook.com/meghfashion',
      'https://m.facebook.com/meghfashion/',
      'http://web.facebook.com/meghfashion?ref=bookmarks',
      'fb.com/meghfashion',
    ]) {
      expect(facebookPageUrlOf(typed), typed).toBe('https://www.facebook.com/meghfashion');
    }
    expect(facebookPageUrlOf('https://www.facebook.com/profile.php?id=1000123&sk=about')).toBe(
      'https://www.facebook.com/profile.php?id=1000123',
    );
  });

  it('refuses another site, the bare home page and a profile without a number id', () => {
    for (const typed of [
      '',
      'instagram.com/meghfashion',
      'https://notfacebook.com/megh',
      'https://www.facebook.com/',
      'facebook.com/profile.php?id=megh',
    ]) {
      expect(facebookPageUrlOf(typed), typed).toBeNull();
    }
  });
});

describe('the chat links', () => {
  it('opens WhatsApp on the international form and Messenger on m.me', () => {
    expect(whatsAppChatLinkOf('01711223344')).toBe('https://wa.me/8801711223344');
    expect(messengerChatLinkOf('meghfashion')).toBe('https://m.me/meghfashion');
  });
});

describe('the settings fields', () => {
  it('keeps each in its one form, and an empty box as null', () => {
    expect(whatsAppNumberField.parse('+880 1711-223344')).toBe('01711223344');
    expect(messengerUsernameField.parse('https://m.me/meghfashion')).toBe('meghfashion');
    expect(facebookPageField.parse('fb.com/meghfashion')).toBe(
      'https://www.facebook.com/meghfashion',
    );
    for (const field of [whatsAppNumberField, messengerUsernameField, facebookPageField]) {
      expect(field.parse('  ')).toBeNull();
      expect(field.parse(null)).toBeNull();
    }
  });

  it('refuses what is none of these', () => {
    expect(whatsAppNumberField.safeParse('0171122').success).toBe(false);
    expect(messengerUsernameField.safeParse('megh fashion').success).toBe(false);
    expect(facebookPageField.safeParse('instagram.com/megh').success).toBe(false);
  });
});
