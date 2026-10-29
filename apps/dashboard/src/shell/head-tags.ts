/** Points the page's `<link rel>` of this kind at a URL, creating it when the page has none; returns the undo. */
export function pointLink(rel: string, href: string): () => void {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  const created = !link;
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  const before = link.getAttribute('href');
  link.href = href;
  return () => {
    if (created) link.remove();
    else if (before !== null) link.setAttribute('href', before);
  };
}

/**
 * Points every `<link rel="icon">` at one picture, dropping the type each declared (the page's own are an .ico and an
 * SVG), so the browser cannot keep one of Lytro's; returns the undo.
 */
export function pointIcons(href: string): () => void {
  const links = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')];
  const before = links.map(
    (link) => [link.getAttribute('href'), link.getAttribute('type')] as const,
  );
  for (const link of links) {
    link.removeAttribute('type');
    link.href = href;
  }
  return () => {
    links.forEach((link, index) => {
      const [was, type] = before[index] ?? [null, null];
      if (was !== null) link.setAttribute('href', was);
      if (type !== null) link.setAttribute('type', type);
    });
  };
}

/** Sets the colour a phone's browser gives its bar, `<meta name="theme-color">`; returns the undo. */
export function pointThemeColor(color: string): () => void {
  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const created = !meta;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  const before = meta.getAttribute('content');
  meta.content = color;
  return () => {
    if (created) meta.remove();
    else if (before !== null) meta.setAttribute('content', before);
  };
}
