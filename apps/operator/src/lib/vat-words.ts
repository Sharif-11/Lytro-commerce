/** D9-7 (Slice 9.9): the VAT a price includes, half up to the paisa, as the server works it out (InvoiceTax). */
export function includedVat(pricePaisa: number, rate: number): string {
  return (Math.round((pricePaisa * rate) / (100 + rate)) / 100).toFixed(2);
}
