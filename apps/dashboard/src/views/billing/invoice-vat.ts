import { formatRate } from '@lytronix/ui';
import { formatDayMonthYear, formatTime } from '@/lib/dates';
import type { Invoice } from '@/types/billing';

/** D9-7, D9-26: the VAT an invoice states -- Lytro's registration and the part of its amount that is VAT. */
export interface InvoiceVat {
  sellerName: string;
  sellerAddress: string;
  sellerBin: string;
  /** The rate as a person reads it: `15`, `7.5`. */
  rate: string;
  amount: string;
}

/**
 * The VAT an invoice carries, or null: an invoice states VAT only when it was issued with all five (Lytro registered,
 * and paid in by wallet or bank). One without them -- before registration, or paid from the balance -- stays as it was.
 */
export function vatOf(invoice: Invoice): InvoiceVat | null {
  const { sellerName, sellerAddress, sellerBin, vatRate, vatAmount } = invoice;
  if (!sellerName || !sellerAddress || !sellerBin || !vatRate || !vatAmount) return null;
  return { sellerName, sellerAddress, sellerBin, rate: formatRate(vatRate), amount: vatAmount };
}

/** When an invoice was issued: the day, and on a Mushak-6.3 tax invoice the time of issue too (Dhaka). */
export function issuedOf(invoice: Invoice, taxInvoice: boolean, language: string): string {
  const day = formatDayMonthYear(invoice.issuedAt);
  return taxInvoice ? `${day}, ${formatTime(invoice.issuedAt, language)}` : day;
}

/**
 * Whether an invoice paid from the balance needs its line on why it shows no VAT (the prototype's
 * `p99-invoice-balance`): only once Lytro was registered when it was issued, which an invoice of the shop's carrying
 * VAT, issued no later, shows. Before registration nothing anywhere shows VAT, so there is nothing to explain.
 */
export function explainsNoVat(invoice: Invoice, invoices: readonly Invoice[]): boolean {
  if (invoice.paymentMethod !== 'balance' || vatOf(invoice) !== null) return false;
  const issued = Date.parse(invoice.issuedAt);
  return invoices.some((each) => vatOf(each) !== null && Date.parse(each.issuedAt) <= issued);
}
