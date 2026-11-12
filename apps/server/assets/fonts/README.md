# Fonts

The two typefaces the server draws a shop's monogram app icon with (TEN-16, TEN-17): its first letter, Bangla or
Latin. They are the marketing site's own fonts (`apps/website/src/fonts`, from the same packages), kept here so the
server never fetches a font and never depends on fonts installed on its machine.

| File                                        | Typeface                            | Characters | From                                           |
| ------------------------------------------- | ----------------------------------- | ---------- | ---------------------------------------------- |
| `inter-latin-wght-normal.ttf`               | Inter (a Latin letter or a digit)   | Latin      | `@fontsource-variable/inter` 5.3.0             |
| `noto-sans-bengali-bengali-wght-normal.ttf` | Noto Sans Bengali (a Bangla letter) | Bengali    | `@fontsource-variable/noto-sans-bengali` 5.3.0 |

**TrueType, not the packages' WOFF2.** sharp's font library can't read WOFF2, so a WOFF2 file draws nothing, or
quietly a fallback font on a machine that has system fonts. Each `.ttf` is the package's `.woff2` decompressed, which
changes no glyph: `python -c "from fontTools.ttLib import woff2; woff2.decompress('<in>.woff2', '<out>.ttf')"` (needs
the `fonttools` and `brotli` packages).

`fonts.conf` is the server's whole fontconfig set-up: no fonts but these, which the code names itself. The server image
and the server's tests point `FONTCONFIG_FILE` at it, so a font that can't be read fails a test instead of falling back.

Both are under the SIL Open Font License 1.1; each `LICENSE-*.txt` here is its licence, as the package shipped it, and
travels with the font as the licence requires. When the website takes a newer version, convert the same files again.
