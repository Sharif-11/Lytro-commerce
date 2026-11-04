import { describe, expect, it } from 'vitest';
import { comboZones, NOWHERE } from '../src/modules/catalogue/services/combo-parts';

// DLV-07: a combo pack is limited to the zones every one of its parts allows, in addition to any limit of its own.
describe('where a combo can go (DLV-07)', () => {
  it('has no limit when nothing it holds has one', () => {
    expect(comboZones([], [[], []])).toEqual([]);
  });

  it("takes a part's limit, and the zones its parts share", () => {
    expect(comboZones([], [['city', 'suburbs'], []])).toEqual(['city', 'suburbs']);
    expect(
      comboZones(
        [],
        [
          ['city', 'suburbs'],
          ['suburbs', 'far'],
        ],
      ),
    ).toEqual(['suburbs']);
  });

  it('keeps its own limit too', () => {
    expect(comboZones(['city'], [[], []])).toEqual(['city']);
    expect(comboZones(['city', 'far'], [['far', 'suburbs']])).toEqual(['far']);
  });

  it('goes nowhere when they share no zone, never reading as no limit', () => {
    expect(comboZones([], [['city'], ['far']])).toEqual([NOWHERE]);
    expect(comboZones(['far'], [['city']])).toEqual([NOWHERE]);
  });
});
