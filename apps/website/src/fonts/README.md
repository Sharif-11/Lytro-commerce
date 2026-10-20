# Fonts

The marketing site's three typefaces (BRAND-IDENTITY.md §5), committed here so `next build` never fetches anything
from a font host. Each is a variable font covering every weight the site uses, cut to the characters it needs.

| File                                          | Typeface                                                      | Characters | From                                           |
| --------------------------------------------- | ------------------------------------------------------------- | ---------- | ---------------------------------------------- |
| `plus-jakarta-sans-latin-wght-normal.woff2`   | Plus Jakarta Sans (wordmark, English headlines)               | Latin      | `@fontsource-variable/plus-jakarta-sans` 5.3.0 |
| `inter-latin-wght-normal.woff2`               | Inter (UI and digits)                                         | Latin      | `@fontsource-variable/inter` 5.3.0             |
| `noto-sans-bengali-bengali-wght-normal.woff2` | Noto Sans Bengali (Bangla)                                    | Bengali    | `@fontsource-variable/noto-sans-bengali` 5.3.0 |
| `noto-sans-bengali-latin-wght-normal.woff2`   | Noto Sans Bengali, its Latin letters, used inside Bangla text | Latin      | `@fontsource-variable/noto-sans-bengali` 5.3.0 |

All three are under the SIL Open Font License 1.1; each `LICENSE-*.txt` here is its licence, as the package shipped
it, and travels with the font as the licence requires. To update a font, take the same file from a newer version of
its package and change the version above.
