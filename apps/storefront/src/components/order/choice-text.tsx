import { Fragment } from 'react';
import type { ChoicePart } from '@/lib/cart/cart-store';

/**
 * The options an order line was bought with, each named in bold as the seller typed it, then the value chosen
 * (the owner, 2026-11-27: "explicitly mention variant name such as size and the choosen value and variant name in
 * bold"; "for key, show what seller types, no translation"): **Size:** XL · **Color:** Navy. A cart line kept from
 * before names its values only, as it always did.
 */
export function ChoiceText({
  parts,
  text,
}: {
  parts: readonly ChoicePart[] | undefined;
  /** The values in words (`XL · Navy`), for a line that has no parts. */
  text: string;
}) {
  if (!parts || parts.length === 0) return <>{text}</>;
  return (
    <>
      {parts.map((part, at) => (
        <Fragment key={`${part.name}:${part.value}`}>
          {at > 0 ? ' · ' : null}
          <b>{part.name}:</b> {part.value}
        </Fragment>
      ))}
    </>
  );
}
