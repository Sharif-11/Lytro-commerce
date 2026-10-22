# Fonts

The two typefaces the server draws a shop's monogram app icon with (TEN-16, TEN-17): its first letter, Bangla or
Latin. They are the marketing site's own files (`apps/website/src/fonts`, from the same packages), copied here so the
server never fetches a font and never depends on fonts installed on its machine.

| File                                          | Typeface                            | Characters | From                                           |
| --------------------------------------------- | ----------------------------------- | ---------- | ---------------------------------------------- |
| `inter-latin-wght-normal.woff2`               | Inter (a Latin letter or a digit)   | Latin      | `@fontsource-variable/inter` 5.3.0             |
| `noto-sans-bengali-bengali-wght-normal.woff2` | Noto Sans Bengali (a Bangla letter) | Bengali    | `@fontsource-variable/noto-sans-bengali` 5.3.0 |

Both are under the SIL Open Font License 1.1; each `LICENSE-*.txt` here is its licence, as the package shipped it, and
travels with the font as the licence requires. When the website takes a newer version, copy the same files here too.
