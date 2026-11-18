/** Two-decimal money text ("1450.00") in paisa, as a whole number, so no sum or ratio meets a float's rounding. */
function paisaOf(amount: string): number {
  return Math.round(Number(amount) * 100);
}

/**
 * SB-10, SB-21: the saving a regular price shows against the price, in whole percent rounded down, so a badge never
 * claims more than the saving; 0 when there is no regular price or it is not above the price. The database keeps a
 * product's best one by the same rule (`refreshPriceRange`).
 */
export function discountPercent(price: string, regularPrice: string | null): number {
  if (regularPrice === null) return 0;
  const regular = paisaOf(regularPrice);
  const now = paisaOf(price);
  if (!(regular > now)) return 0;
  return Math.floor(((regular - now) * 100) / regular);
}
