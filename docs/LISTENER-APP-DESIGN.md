# Lytro Listener: the Android app

Status: v1.2, 2026-11-03. The design of Lytro Listener, the app a shop runs on the phone that holds its bKash SIM. It
forwards payment receipt SMS to Lytro, so an order's advance verifies by itself. It is built in Phase 5 Slice 5.5
(`PHASE-5-PLAN.md`) in `apps/listener-android`, every screen here included. It has not yet run on a real phone: the Xiaomi test,
real bKash receipts and the download page (Slice 5.8) stand between it and a shop. The interactive prototype is
`docs/brand/lytro-listener.html` (320, 360 and 412 px; Bangla with the EN toggle; every screen and state).

Requirements covered: `SRS-detailed.md` LSN-01 to LSN-24, VER-06, VER-07, TEN-16 (the icon), I18N. Brand:
`BRAND-IDENTITY.md` 8.5.

**Decisions (read agreed 2026-11-02).**

| Point | Decided |
| --- | --- |
| Language | Kotlin, native Android. React Native (OD-52) stays for the admin app. The app's real work is Android's own: catching SMS and staying alive in the background. |
| Home screen | The status, today's counts and the recent receipts, so an owner can see it working. Only payment receipts ever show. |
| Installing | A signed APK from Lytro, linked from the dashboard. Google Play limits apps that read SMS; applying can come later. |
| Screen language | Bangla, with an English switch on Welcome and in the menu. |
| This sketch | The app. The dashboard's phones page is drawn in Slice 5.8; a reference frame shows only its pairing card. |

**Decisions (5.5's build, agreed 2026-11-03).**

| Point | Decided |
| --- | --- |
| Android's block on SMS | Real: Android 15 and later refuse SMS to an app installed from a browser, with no Allow to tap. A help screen leads the owner out (2.4). |
| Several or no bKash numbers | Several are all listed under the one question. None: it says so, and setup carries on; Home keeps saying it (2.3). |
| A pairing link | Pairs straight away, the owner's pick: one tap fewer, knowing a link sent by someone else could pair the phone with their shop, which the next screen names. A phone already paired ignores links (§7). |
| How far the look-back reaches | 7 days, and never behind this phone's pairing: Home does not start full of old money, and a phone re-paired to another shop cannot send the last shop's receipts (§6). |

**Decisions (5.5b's read, agreed 2026-11-03).**

| Point | Decided |
| --- | --- |
| Names in the menu | Each report also carries the phone's and the shop's names, so a rename on the dashboard reaches the menu within 15 minutes. A small server addition. |
| A test receipt's sender | The server's list of this phone's receipts names the sender, and a test receipt shows it, since which sender was read is much of what test mode is for. |
| "Up to date" | Not claimed. The server knows only the oldest version it accepts, so the menu shows just the version. An update is offered when the minimum rises. |
| The signing key | Made at the first real release, not before. `scripts/new-release-key.sh` makes it, outside the repo, and `:app:listenerRelease` refuses to build without it. |
| The battery warning | Clears once Android's exemption is on and the owner has opened the maker's setting from our button. No app can read a maker's Autostart switch, so this can't prove it was flipped, but nobody skips the step by accident. |
| Oppo, Vivo and Samsung | Their drawn steps show, with a line saying menu names can differ by phone. **Unverified on real phones,** since the one real phone to hand is a Xiaomi. |
| Support and Help | Support opens the same WhatsApp as the dashboard: the help line's, read from `GET /v1/listener/help-line` on the API host when the app opens (Slice 8.8's read, 2026-11-10; the API host answers only its own public routes, KNOWN-GAPS §141), with the number set when a release is built as the fallback, also while the server can't be reached or has none; with neither, its rows hide. Help always shows and opens the setup guide on `lytro.app/listener` (Slice 5.8), which carries that WhatsApp too. Phones get it with the next APK. |
| Merging | On green CI, the owner's pick over testing on the Xiaomi first, so what that test finds becomes a follow-up. |

---

## 1. Who it is for, and the one job

The person is a shop's owner or a staff member, often on a budget Android phone that is also the shop's bKash phone.
They set it up once, then forget it. Afterwards they open it for one reason: **is it working, and if not, what do I do?**

So:

- **One status, always at the top.** A band under the app bar says the state in two or three words, in its colour (§3).
- **One action when something is wrong,** directly under the band, saying what fixes it. Never a list of settings.
- **Nothing to learn.** No tabs, no navigation beyond a menu. The app works with its screen off and closed.
- **Honest about SMS.** It reads SMS, which is alarming, so it says exactly what leaves the phone (§2.4).

## 2. First setup

Pairing comes first, so the phone knows its shop before asking for anything. Each step is one screen, one decision.

| # | Screen | What it shows | Primary action |
| --- | --- | --- | --- |
| 2.1 | Welcome | The language switch; what happens in three lines; "run this on the phone with your shop's bKash SIM" | Get started |
| 2.2 | Pair: scan | The camera with marigold corners; where to find the QR on the dashboard (Settings → Listener phones → Pair a phone) | Type the code instead |
| 2.2 | Pair: type | 8 boxes, 4 + 4, marigold-300 with ink characters as they fill. Letters are capitalised as typed; the alphabet has no 0/O or 1/I/L | Pair this phone, enabled when full |
| 2.3 | Paired: the right phone? | "Paired with Megh Fashion", then the shop's active bKash number and "is this number's SIM in this phone?" | Yes / No, it's in another phone |
| 2.4 | Step 1 of 3: SMS | Three promises (§2.4) and a warning that Android's own dialog says "send and view" | Allow, then Android's dialog |
| 2.5 | Step 2 of 3: notifications | The notification always shows it is running, and tells of a problem. Android 13 and later only | Turn on |
| 2.6 | Step 3 of 3: battery saver | Why, then the system's exemption dialog; on the makers below, the extra step and a button to open that setting | Exempt it, or Later |
| 2.7 | Test | The bKash number and "send a small amount from another phone"; a spinner until the SMS arrives, then the receipt and "all good" | Later is prominent: the next real payment shows the same thing |

**2.3 is there because it is the likeliest mistake.** Android cannot reliably tell an app the SIM's number, so the app
asks. "No" unpairs this phone at once (the same call as the menu's Unpair, §7), so a one-phone plan's place is free for the
right phone, and returns to Welcome, which says which phone the app belongs on. The right phone needs a new code.

A shop can have **several** active bKash numbers: all are listed, under "is the SIM of one of these numbers in this phone?".
With **none** there is nothing to ask, so the screen says the shop has no active bKash account and what the owner does about
it, with one button, Continue; Home keeps saying it until a number is active.

**2.4 Three promises, each true:**

1. Only bKash's payment SMS are sent. *The app filters on the phone: a sender on the list the server gives it, and a
   message that looks like a transaction. bKash's sign-in codes and offers come from the same sender and stay on the phone.*
2. No other SMS leaves this phone. *Filtered before any upload (LSN-16). Test mode is the one exception, and says so: an
   unknown sender's message that looks like a receipt is sent, for the 10 minutes it is on.*
3. This app never sends SMS itself. *It asks for no send permission; Android's dialog says "send and view" because that
   is how it names the whole SMS group, which is why the screen warns of it first.*

**2.6 The extra step, by maker.** Budget phones kill background apps harder than Android's own setting allows for. The
app reads the phone's maker and shows that maker's step only, with a line saying menu names can differ by phone. Open Settings
goes to App info on every maker: it is where Xiaomi's step is, and it is the one page that always exists, whereas Xiaomi's own
Autostart screen has moved between versions. The menu paths are to be checked on real phones before release (§7), and only Xiaomi's
can be for now. Later goes straight to Home, which warns until Android's exemption is on and that setting has been opened.

| Maker | Where | What |
| --- | --- | --- |
| Xiaomi, Redmi, POCO | Settings → Apps → Lytro Listener | Turn on Autostart; Battery saver: No restrictions |
| Oppo, Realme | Settings → App management → Lytro Listener | Battery usage: Allow background activity, Auto launch |
| Vivo, iQOO | Settings → Battery → Background power consumption | Allow; Autostart in i Manager |
| Samsung | Settings → Apps → Lytro Listener → Battery | Unrestricted |
| Any other | | The system dialog alone |

**When pairing is refused**, the screen stays and says why, using the server's own message in the app's language
(`Accept-Language`), so the words have one home:

| Server's answer | What shows |
| --- | --- |
| `404 not_found` (unknown, spent, voided or lapsed code) | The boxes turn red; "make a new one in the dashboard"; Try again |
| `429 rate_limited` | "Try again in 12 minutes", from `Retry-After`; the button stays off until then |
| `402 plan_limit_reached` (LSN-24, device limit reached) | "All your plan's phones are paired", revoke one or upgrade; Try again |
| `403 tenant_offline` | Stopped: subscription inactive (§3.3) |
| `403 forbidden` | Stopped: installation blocked (§3.3) |
| `426 app_update_required` | Stopped: update required (§3.3) |
| No connection | "No internet", Try again; the code stays in the boxes |

SMS permission refused: "the app can't work without it", with Open Settings. Setup continues nowhere else until it is
given, since nothing else matters without it.

**Android's own block (seen on Android 16, 2026-11-03).** From Android 15, SMS is a restricted setting for an app installed
from a downloaded or local file, which is how every shop gets this one. Android answers Allow with "App was denied access to
SMS" and a Close button, with no way to allow it there. So when Android 15 or later refuses an app installed that way with no
way of asking again, the next screen is not the refusal above but its way out: open App info, ⋮ at the top right, "Allow
restricted settings", then back to the app, where Allow now shows Android's usual dialog. That menu item appears only after a
refusal, which is why the app asks first and explains after. An app cannot read this setting itself (it is refused with a
SecurityException), so the screen is chosen from the Android version, the install source and whether Android will ask again.
A person who freed it and then refused twice also lands here; Open Settings is still the right button for them. Whether Xiaomi's
own Android does the same is to be seen on a real phone.

Camera refused: the camera's frame says so, with Allow, and "type the code instead" stays below it. Nothing else needs it.

## 3. Home

### 3.1 Layout

From the top: the app bar (icon, name, menu), **the status band**, then today's counts (Verified, Waiting, Staff to
check), then recent receipts, then a line saying only bKash's SMS are read for now (LSN-06). No pull to refresh: it
refreshes when opened and every 30 seconds while open.

The band follows `BRAND-IDENTITY.md` 8.5, with one named change: danger is a solid `#c8323b` band with white text, since
danger-coloured text on `#0c1a19` is too faint for Bangla's thin strokes. Secondary text is neutral-200, never dimmer.

| Band | Colour | Words | Below it |
| --- | --- | --- | --- |
| Working | teal-400 on `#0f3330` | "চালু আছে", "last report 2 minutes ago" | Counts, receipts |
| Working, nothing yet | same | same | "No receipts yet", and the bKash number |
| No internet | marigold-300 | "3 receipts are saved and go by themselves" | Receipts, saved ones marked; no button, nothing to do |
| Test mode | ink on marigold-300 | "Test mode · 8:42 left" | Receipts, test ones marked |
| At risk: battery saver | marigold-300 | "The battery saver may stop this app" | Fix it; counts; receipts |
| At risk: no bKash number | marigold-300 | "Your shop has no active bKash account" | What the owner does on the dashboard; receipts |
| SMS permission off | danger | "Nothing verifies by itself until this is fixed" | Fix it; what happened; receipts |

### 3.2 A receipt

Wallet and amount, the time, the TrxID, then one line saying where it stands.

| State | Words | Colour |
| --- | --- | --- |
| Verified | Order #261102-0042 verified | teal-300, check |
| Not matched yet (VER-04) | It matches when the customer types the TrxID | marigold-300, clock |
| Needs review (VER-02) | The amount didn't match; staff will check | marigold-300, alert |
| Short balance (WAL-21) | Balance too low, so staff will verify by hand | marigold-300, wallet |
| Saved on the phone | Saved on the phone | neutral-200, clock |
| Already sent (VER-03) | Already sent | neutral-200, check |
| Test (LSN-04) | Read fine; this sender isn't on the list, so it verifies nothing | neutral-200, flask |

"Not matched yet" is not an alarm. Money that reaches this number for other reasons stays here, and that is fine, so it
never turns red and never notifies.

### 3.3 Stopped

When the phone may not work at all, the band says so, and the rest of the screen explains. Each maps to one server answer,
checked on every call, so a change shows on the next one (LSN-07, LSN-19).

| State (LSN-24) | Server's answer | Words | Action | Background |
| --- | --- | --- | --- | --- |
| Subscription inactive | `403 tenant_offline` | "It comes back by itself when the plan renews"; how many receipts are held | Check again | Keeps reading and holding receipts, tries each 15 minutes |
| Revoked | `401`, `details.reason` `owner`, `operator` or `flags` | The reason in a sentence | Pair again | **Stops** (LSN-19); clears the token |
| Blocked | `401`, `details.reason: installation_blocked` | "It won't pair with any shop" | Contact support | Stops; clears the token |
| Update required | `426 app_update_required`, `details.minimum` | The two versions; receipts are held | Download the update | Keeps reading and holding |
| Not paired | No token | The band, on the pairing screens | | Nothing runs |

Held receipts stay on the phone for up to 7 days, since the server ignores older ones anyway (LSN-15).

## 4. The menu

Language; this phone's name (renamed on the dashboard, LSN-20); the shop and its bKash number; last report; app version;
test mode; help; **Unpair this phone**, with a confirmation that says payments go back to being verified by hand. A phone that
unpaired itself goes straight to Welcome, with no "revoked" screen and no notification.

**Test mode (LSN-04) starts here, on the phone.** A phone reports every 15 minutes, so it would not hear a switch on the
dashboard for up to that long. It verifies nothing, so holding the paired phone is enough to start it.

## 5. Android's own surfaces

- **The always-on notification** (foreground service): "Lytro Listener চালু আছে। পেমেন্ট SMS মিলছে।", silent, in the
  status bar as the white mark. Its text follows the band: no internet, saved receipts.
- **Problem notifications,** with a sound: SMS permission off, subscription inactive, update required. Once per problem,
  not repeated, and tapping opens the app. A revoked phone shows one last notification, then stops.
- **The launcher icon** is `icon-listener.svg`; the status bar's is `icon-listener-notification.svg`.

## 6. How it behaves

Settled in 5.5's build:

- **Catching SMS.** A manifest receiver for incoming SMS, kept alive by a foreground service of the kind `specialUse`, since
  from Android 15 `dataSync` stops after 6 hours a day and may not start at boot. On boot and on each report it also reads the
  inbox for receipts it missed while killed: allowed senders only, up to 7 days back and never behind this phone's pairing.
  The server would keep a repeat only as "Already sent", on Home and against the volume flag (LSN-14), so the phone remembers
  what it has sent by a fingerprint of it, never its text, and sends each message once.
- **Filtering.** A message leaves the phone only if its sender is on the server's list and it looks like a transaction: a
  transaction ID, or an amount with a balance, the same test the server uses. bKash's sign-in codes come from the same sender,
  so the sender alone is not enough, and they must never reach Lytro. New wallets need no app update, only a server change.
  In test mode, an unknown sender's message is sent only if it looks like a receipt (an amount and a TrxID).
- **Uploading.** Saved first to a private queue, then sent at once where that works, with background work as the fallback,
  retried with backoff. Removed once the server has it, so raw SMS never lingers; a message the server answers with no status
  stays to go again. At most 50 in a request and under 64 KB in bytes, and a message over 1,000 characters never leaves, since
  the server would refuse the whole batch. No SMS text in logs. Unpaired or revoked, every saved message is deleted.
- **Reporting.** A heartbeat right after pairing, since a phone counts online only once it has reported, then every 15 minutes
  (LSN-03), at most 4 an hour (LSN-13). The server's time on its answer corrects a wrong phone clock, which would otherwise
  make a receipt look like it comes from the future (LSN-15).
- **The token and installation ID** are kept in Android's keystore-backed storage, excluded from backups, so a restored
  phone has to pair again rather than trip the installation flag (LSN-12).
- **Android 7 and later,** in a small APK. QR reading must not need Google Play services.

**Installing and updating.** The dashboard links to a download page, `lytro.app/listener` (SITE-PAGES-DESIGN §6, built in Slice 5.8,
with the file on its own bucket at `download.lytro.app`), with the guide drawn in the prototype. The menu's Help opens its setup guide.
Android asks to allow installs from the browser, and Play Protect may warn; both are in the guide, with a warning to
download only from `lytro.app`. An update is the same download, offered when the server's minimum rises (LSN-18). The
signing key is kept out of the repo, and losing it means every shop reinstalling, so it needs a backup plan before release.

## 7. What 5.4b must add for this

The sketch assumes four things the server does not do yet. They go into Slice 5.4b:

| Addition | For | Shape |
| --- | --- | --- |
| The shop's numbers and senders | §2.3, Home's "no bKash number", the filter | `accounts: [{ method, number }]` and `senders: ["bKash"]` on the pair and heartbeat answers |
| Recent receipts and counts | §3.1, §3.2 | `GET /v1/listener/messages?limit=20`: each with its current state and order number, and today's counts |
| Unpairing itself | §2.3, §4 | `POST /v1/listener/unpair`, revoking with a new reason `device`, freeing the plan's place |
| Test mode from the phone | §4 | `POST /v1/listener/test-mode` with `testModeUntil` on the answers |

The QR needs no server change: it holds the code as a link, `lytro-listener://pair?code=K7MP4X2H`, which the dashboard draws
in Slice 5.8, so a phone's own camera can open the app too. Scanned or tapped, it pairs straight away (agreed 2026-11-03); a
phone already paired ignores it, so no link can move a working phone to another shop.

**The download page (Slice 5.8) must warn of Android's block** (§2's end): on Android 15 and later, step 1 of setup stops at
"App was denied access to SMS" until the owner follows the app's help screen. It is expected, and the guide should say so.

**Google Play, if it ever comes:** this app asks for Android's battery exemption directly and reads SMS, both of which Play
restricts, so applying would mean changing how it does both.

**Before release:** real bKash receipts for the parser (agreed in 5.4's read, the owner to forward a few); the makers'
menu paths checked on real phones; the download page, in `SITE-PAGES-DESIGN.md`'s style; the signing key's backup.

**Not drawn on purpose:** the device-integrity check (LSN-25, off by default, a could-have); other wallets' receipts,
which come only with samples (LSN-06), and need only a server change when they do.
