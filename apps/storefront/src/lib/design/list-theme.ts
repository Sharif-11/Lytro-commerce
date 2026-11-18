import type { ProductCardStyle } from '@lytronix/validators/common';

/** STOREFRONT-BUILDER-PLAN SB-17: what a list draws its cards with -- the theme's card and its look. */
export interface ListTheme {
  card: ProductCardStyle;
  variables: Record<string, string>;
}
