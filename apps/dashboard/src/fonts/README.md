# Fonts

The dashboard's three typefaces (BRAND-IDENTITY.md §5), served with the app so it never fetches a font from a font
host and an installed app opens in Lytro's own type offline. They are the marketing site's own files
(`apps/website/src/fonts`); `src/styles/fonts.css` declares them. A shop's brand fonts (BRN-02) are the only ones
loaded from Google Fonts, and only while its brand identity shows.

| File                                          | Typeface                                                      | Characters | From                                           |
| --------------------------------------------- | ------------------------------------------------------------- | ---------- | ---------------------------------------------- |
| `inter-latin-wght-normal.woff2`               | Inter (UI and digits)                                         | Latin      | `@fontsource-variable/inter` 5.3.0             |
| `noto-sans-bengali-bengali-wght-normal.woff2` | Noto Sans Bengali (Bangla)                                    | Bengali    | `@fontsource-variable/noto-sans-bengali` 5.3.0 |
| `noto-sans-bengali-latin-wght-normal.woff2`   | Noto Sans Bengali, its Latin letters, used inside Bangla text | Latin      | `@fontsource-variable/noto-sans-bengali` 5.3.0 |
| `plus-jakarta-sans-latin-wght-normal.woff2`   | Plus Jakarta Sans (the wordmark, English display)             | Latin      | `@fontsource-variable/plus-jakarta-sans` 5.3.0 |

All three are under the SIL Open Font License 1.1; each `LICENSE-*.txt` here is its licence, as the package shipped
it, and travels with the font as the licence requires. When the website takes a newer version, copy the same files
here too.
