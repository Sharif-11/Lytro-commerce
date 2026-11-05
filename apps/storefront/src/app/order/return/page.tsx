import { notFound, redirect } from 'next/navigation';

// SFT-07, PAY-08 (Slice 5.8's part 2): where the payment page returns a shopper. The order had no tracking ID when this address
// was given, so the page names it here, and the shopper goes on to the order's own page, which reads what truly happened.
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ tracking_id?: string; status?: string }>;
}

export default async function PaymentReturnPage({ searchParams }: Props) {
  const { tracking_id: trackingId, status } = await searchParams;
  if (!trackingId) notFound();
  const query = status === 'failed' ? '?pay=failed' : '';
  redirect(`/order/${encodeURIComponent(trackingId)}${query}`);
}
