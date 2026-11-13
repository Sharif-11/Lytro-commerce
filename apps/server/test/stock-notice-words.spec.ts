import { describe, expect, it } from 'vitest';
import { StockUnit } from '@lytronix/validators';
import {
  batchExpiringText,
  heldStockExpiredText,
  lowStockText,
} from '../src/modules/notifications/notification-words';

// UOM-01, INV-08, INV-13: the stock notices write amounts as people do -- the database's three decimals ("3.000") never
// show (staging's bell read "মাত্র 3.000টি বাকি", 2026-11-12) -- and name the product's unit unless it is counted in pieces.
describe('the stock notices', () => {
  it('writes a whole number of pieces without decimals', () => {
    const text = lowStockText({
      productName: 'Irani burka',
      available: '3.000',
      threshold: '5.000',
      unit: StockUnit.Piece,
    });
    expect(text.bn.body).toBe('মাত্র 3টি বাকি (অ্যালার্ট 5-এ)।');
    expect(text.en.body).toBe('Only 3 left (alert at 5).');
  });

  it('names a measured unit and keeps the decimals it has', () => {
    const text = lowStockText({
      productName: 'Rice',
      available: '3.500',
      threshold: '5.000',
      unit: StockUnit.Kg,
    });
    expect(text.bn.body).toBe('মাত্র 3.5 কেজি বাকি (অ্যালার্ট 5-এ)।');
    expect(text.en.body).toBe('Only 3.5 kg left (alert at 5).');
  });

  it("says whose expiry it is with the unit's possessive", () => {
    const pieces = batchExpiringText({
      productName: 'Face cream',
      batchCode: 'FC-1102',
      quantity: '12.000',
      unit: StockUnit.Piece,
      expiresOn: '14 Mar 2027',
    });
    expect(pieces.bn.body).toBe('ব্যাচ FC-1102-এর 12টির মেয়াদ 14 Mar 2027-এ শেষ হবে।');
    expect(pieces.en.body).toBe('Batch FC-1102: 12 expire on 14 Mar 2027.');
    const litres = batchExpiringText({
      productName: 'Milk',
      batchCode: null,
      quantity: '1.250',
      unit: StockUnit.Liter,
      expiresOn: '2 Dec 2026',
    });
    expect(litres.bn.body).toBe('একটি ব্যাচের 1.25 লিটারের মেয়াদ 2 Dec 2026-এ শেষ হবে।');
    expect(litres.en.body).toBe('A batch: 1.25 L expire on 2 Dec 2026.');
  });

  it('counts one pack and many packs in English', () => {
    const text = heldStockExpiredText({
      productName: 'Tea',
      reserved: '4.000',
      short: '1.000',
      unit: StockUnit.Pack,
    });
    expect(text.bn.body).toBe('অর্ডারের জন্য রাখা 4 প্যাকের মধ্যে 1 প্যাকের মেয়াদ শেষ হয়ে গেছে।');
    expect(text.en.body).toBe('1 pack of the 4 packs held for orders have expired.');
  });

  it('never shows trailing zeros or a missing unit name, in any unit', () => {
    for (const unit of Object.values(StockUnit)) {
      const bodies = [
        lowStockText({ productName: 'x', available: '2.000', threshold: '10.000', unit }),
        batchExpiringText({
          productName: 'x',
          batchCode: null,
          quantity: '0.500',
          unit,
          expiresOn: 'd',
        }),
        heldStockExpiredText({ productName: 'x', reserved: '7.000', short: '2.000', unit }),
      ].flatMap((text) => [text.bn.body, text.en.body]);
      for (const body of bodies) {
        expect(body).not.toMatch(/\d\.\d*0\b/);
        expect(body).not.toMatch(/undefined/);
      }
    }
  });
});
