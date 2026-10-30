import { describe, expect, it } from 'vitest';
import { mainAddressTarget } from '../src/lib/request-path';

// Slice 13 (its read, points 2 and 3): a shop whose own domain serves answers there only; its Lytro address and the
// domain's twin lead to the same page on it.

const serving = { mainHost: 'megh.com', publicOrigin: 'https://megh.com' };

describe('where another host of the shop leads', () => {
  it('leads the Lytro address and the twin to the same page on the main address', () => {
    expect(mainAddressTarget('megh.lytro.app', serving, '/p/kurti', '?v=2&utm_source=fb')).toBe(
      'https://megh.com/p/kurti?v=2&utm_source=fb',
    );
    expect(mainAddressTarget('www.megh.com', serving, '/l/kurti', '')).toBe(
      'https://megh.com/l/kurti',
    );
    expect(mainAddressTarget('megh.lytro.app', serving, '', '')).toBe('https://megh.com/');
  });

  it('stays on the main address, and on the Lytro address while no own domain serves', () => {
    expect(mainAddressTarget('megh.com', serving, '/p/kurti', '')).toBeNull();
    expect(
      mainAddressTarget(
        'megh.lytro.app',
        { mainHost: null, publicOrigin: 'https://megh.lytro.app' },
        '/',
        '',
      ),
    ).toBeNull();
  });
});
