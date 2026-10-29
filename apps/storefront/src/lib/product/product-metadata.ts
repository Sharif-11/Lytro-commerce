import type { Metadata } from 'next';
import type { PublicProduct, PublicShop } from '../api/storefront-api';
import { money } from '../i18n/words';

/** LND-05: the link preview a shared product or landing link shows: the product's photo, name, price or range, and the
    shop's name, server-rendered as Open Graph and Twitter Card tags. */
export function productMetadata(
  product: PublicProduct,
  shop: PublicShop,
  origin: string,
  path: string,
): Metadata {
  const price =
    product.minPrice === null
      ? null
      : product.maxPrice !== null && product.maxPrice !== product.minPrice
        ? `${money(product.minPrice)} – ${money(product.maxPrice)}`
        : money(product.minPrice);
  const title = `${product.name} · ${shop.name}`;
  const summary = product.description?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '';
  const description = [price, summary || shop.name].filter((part) => part).join(' · ');
  const image = product.images[0]?.urls.main;
  const images = image ? [{ url: image, alt: product.name }] : [];
  return {
    metadataBase: new URL(origin),
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      url: path,
      siteName: shop.name,
      title,
      description,
      images,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : [],
    },
  };
}
