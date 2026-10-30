import { describe, expect, it } from 'vitest';
import { AppUrls } from '../src/lib/urls';

const urls = new AppUrls('https://app.lytro.app');

describe('AppUrls', () => {
  it('sends sign-up to the code form, carrying the claimed shop and the picked plan', () => {
    expect(urls.signIn()).toBe('https://app.lytro.app/sign-in');
    expect(urls.signIn({ shop: 'megh', planId: 'p1', termId: 't1' })).toBe(
      'https://app.lytro.app/sign-in?shop=megh&planId=p1&termId=t1',
    );
  });

  it('opens the same door on the password form for a seller coming back', () => {
    expect(urls.logIn()).toBe('https://app.lytro.app/sign-in?mode=password');
  });
});
