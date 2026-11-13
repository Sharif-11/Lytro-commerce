#!/usr/bin/env bash
# The browser the Playwright tests run in, installed from the app whose tests need it (ci.yml).
#
# The browser comes from Playwright's own servers; --with-deps adds a few fonts (Japanese, Chinese, Thai, fallback)
# through apt, from Ubuntu's mirrors. Every library the browser needs is already on the runner's image. When the
# mirrors can't be reached (2026-11-11: no *.ubuntu.com name resolved for hours, and apt failed after 14 minutes of
# retries), the run goes on with the browser alone and says so. Our screens are Bangla and English, and each picture
# pair draws the app and its prototype in the same browser, so the pairs stay comparable.
set -u

if getent hosts archive.ubuntu.com security.ubuntu.com > /dev/null &&
  pnpm exec playwright install --with-deps chromium; then
  exit 0
fi
echo "::warning title=Test browser without its extra fonts::Ubuntu's package mirrors could not be reached, so the browser was installed without the fonts --with-deps adds."
pnpm exec playwright install chromium
