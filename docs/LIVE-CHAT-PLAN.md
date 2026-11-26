# Live chat between a shop and Lytro — plan

Status: **sketch drawn, awaiting the owner's approval** (2026-11-27). Nothing is built. Sketches: `lc-*` screens in
`docs/brand/lytro-dashboard.html` (the seller's side) and `oc-*` screens in `docs/brand/lytro-operator.html` (Lytro's
side); PNGs in `Desktop/Lytro screenshots/live-chat/`.

## 1. Purpose

A shop's owner and staff talk to Lytro live, from any screen of the dashboard, and Lytro answers from any screen of the
console. It is Lytro's support channel for the shops it is switched on for; the WhatsApp and phone help line (D8-4,
D8-68) stays for everyone. Some common questions may be answered by an AI, with care and a hard cost cap.

It **replaces the ticket design** of SRS `SUP-04` to `SUP-06` (tickets, an operator inbox with response targets per
plan): the owner chose live chat instead (2026-11-27, "i prefer live chat for now"). The SRS is not edited; KNOWN-GAPS
§152 records the amendment, as the SRS stays requirements-only.

## 2. The owner's decisions (verbatim) and how they read

| ID | The owner said (2026-11-27) | How it reads |
|---|---|---|
| LC-1 | "i prefer live chat for now" | Live chat, not tickets. One conversation per shop. |
| LC-2 | "this instant chat is a feature, i can assign it to a plan or a shop and can also unassign it" | A feature switch per plan, and an override per shop (on, off, or follow the plan). The shop's override wins over its plan. See §4. |
| LC-3 | "use socket live connection" | WebSocket. See §6. |
| LC-4 | "introduce a notification option in operator with optional sounds like seller has now" | The console gets a bell count, a sound switch and the same sound, and the browser's push, like the dashboard's (snd-prefs, 2026-11-19). |
| LC-5 | Point 3 "is ok" | The busy line after 10 minutes unanswered within hours (§5.5). |
| LC-6 | Point 5: "one chat per shop, i saw shop, person name and (owner or staff, just two color for name)" | One chat per shop. Each message shows the person's name, coloured by role: owner in one colour, staff in another. |
| LC-7 | Point 6: "not needed now" | No seen ticks, no "typing…". |
| LC-8 | Point 7: "ok, but we periodically delete old photos after a configurable time from operator console" | Photos up to 3 per message; deleted after a console setting (§7). |
| LC-9 | Point 8: "clickable shop name, if i click then it show detail" | The shop name in the chat opens the console's shop page. |
| LC-10 | Point 9: "i discuss with you further"; then (the coordinator, relaying the owner): keep ready-made replies as the operator's own quick-reply list | The operator's own list of quick replies: a picker in the chat's composer and a simple list editor in the settings (§9). Not linked to the AI. |
| LC-11 | Point 10: "chat history retention is one week" | Messages older than 7 days are deleted nightly; a console setting, 7 by default (§7). |
| LC-12 | "A floating chat button in home screen, for sometimes then disappear, in menu the chat option is a floating button. the chat button is small please, it won't hamper visibility and daily activity, ui/ux, during scroll disappear" | §5.1. |
| LC-13 | "When I sent a message then seller has a floating message button with sound to reply it and same goes for me, in any time or in any screen" | An unread message brings the button onto any screen, with a sound, on both sides (§5.2). |
| LC-14 | "i can choose ai model any time, like i do for others now" | The chat AI's provider and model are console settings, as the address reader's are (`address_read_provider`, `address_read_model`, AI-10, D7-4). §8.1. |
| LC-15 | "ai is an optional feature, i can switch it off or on" | A global switch, and AI as its own feature per plan and per shop, like LC-2. |
| LC-16 | "ai send directly if confident enough otherwise approval" | A confident answer goes to the seller at once; anything else becomes a draft Lytro approves, edits or discards (§8.3). |
| LC-17 | "a configurable costing cap" | A monthly AI budget; at it, the AI stops and the chat is human-only until the month turns (§8.4). |
| LC-18 | "configurable ai replies per shop (including unlimited)" | A number of AI replies per shop per day, or unlimited (§8.4). |
| LC-19 | Point 5 of the earlier list: "every time home opens" | Home's button shows for 5 seconds each time Home opens. |
| LC-20 | "no sound" for chats the AI fully answered (the coordinator, relaying the owner) | They show in the inbox with a quiet count and the AI mark. The sound plays only when a person is needed: the AI handed over, a draft awaits approval, or the seller asked for a person. |
| LC-21 | "how to answer via ai with cost optimization, i discuss this with you further"; then: how the AI knows the platform is a separate discussion for later | **To discuss** (§8.6): one placeholder, not designed, not linked to the quick replies. |

## 3. Who sees what

- **The seller's side:** every signed-in member of the shop's team (owner and staff) sees the shop's one chat. Read is
  tracked per person (§5.2).
- **Lytro's side:** the operator console's inbox; every operator sees every chat.
- **A shop without the feature** sees no chat button anywhere; the help line in Menu stays.

## 4. The feature switch (LC-2, LC-15)

| Case | What happens |
|---|---|
| The plan has chat on | Every shop on it has chat, unless the shop's own override says off. |
| The plan has chat off | No shop on it has chat, unless the shop's own override says on. |
| A shop's override | On, off, or follow its plan; it wins over the plan. Shown on the shop page with what the plan says. |
| Switched off while a chat is open | The button and the chat close at once; the socket is closed with a reason the dashboard shows as a quiet line; nothing is lost on Lytro's side. History still goes after 7 days. |
| Switched on | The button appears at the next page change or within a minute (the dashboard's settings refresh). |
| The AI feature (LC-15) | The same two levels, plus a global switch over both. With the global switch off, no AI runs anywhere. |
| A plan or shop has the AI but not chat | Nothing: the AI only answers in a chat. The console says so beside the switch. |

## 5. The seller's side

### 5.1 The floating button (LC-12, LC-19)

- **Small:** a 44 px circle (the smallest comfortable tap), the chat icon, at the bottom right **above the tab bar**
  with a 12 px gap, never over it. The "+" lives in the app bar at the top, so it is never covered. On a screen with a
  fixed bottom bar (a save bar), the button sits above that bar. On a computer, at the bottom right of the main column.
- **Home:** it slides in when Home opens, stays **5 seconds**, then slides away. Every time Home opens (LC-19).
- **Menu:** always there.
- **Any other screen:** not there, unless a message is unread (§5.2).
- **While scrolling** it hides, and comes back a second after the scroll stops.
- **A toast** pushes it up while the toast shows; **a sheet or dialog** covers it, and it waits behind (§5.2).

### 5.2 An unread message, on any screen (LC-13)

| Case | What happens |
|---|---|
| Lytro replies while the dashboard is open | The button pops in on whatever screen it is, with a count, and the chat sound plays. |
| Tapping the button | The chat opens: a sheet on a phone, a side panel on a computer. What was underneath stays as it was. |
| After reading | The button goes back to §5.1's rules. |
| Several tabs | The sound plays once, in the tab in front (or the newest if none is). |
| The owner and staff | Each signed-in person gets the button. Read is per person: staff still see it after the owner has read. |
| A sheet or dialog is open | The button waits behind it and shows when it closes, so it never blocks a form. |
| The dashboard closed, or the phone locked | A push (the existing web push); tapping it opens the dashboard straight into the chat. |
| The sound | Follows the person's chat sound switch (§5.6). Browsers play sound only after the person has touched the page once since opening it; before that, the button comes silently. |

### 5.3 The chat

- Lytro's messages on the left with Lytro's mark; the shop's on the right, each with the person's name.
- Up to 3 photos per message, through the existing photo upload (§7).
- A quiet line at the top: older messages are deleted after 7 days (the setting's number).
- An AI answer carries **"স্বয়ংক্রিয় উত্তর"** and a link **"মানুষের সাথে কথা বলুন"** (§8.3).
- The help line's WhatsApp stays one tap away in the chat's header menu.

### 5.4 Outside hours

The help line's hours (`help_opens_hour`, `help_closes_hour`, 9 to 22 by default, D8-68). Outside them the chat still
takes messages; the seller sees "আমরা সকাল ৯টায় উত্তর দেব" (the setting's hour) and, for anything urgent, the WhatsApp
button. If the AI is on and allowed, it may answer (§8).

### 5.5 The busy line (LC-5)

Within hours, a message unanswered for **10 minutes** (a console setting) gets one automatic line: "একটু ব্যস্ত আছি —
শিগগিরই উত্তর দিচ্ছি", with the WhatsApp button for anything urgent. Once per waiting stretch, never twice in a row.

### 5.6 The chat sound

The Notifications page's Sound card (snd-prefs) gets a second row, **"চ্যাট মেসেজে সাউন্ড"**, on by default, per
device, with the same sound and "সাউন্ড শুনুন".

## 6. Live connection and load (LC-3)

- **WebSocket**, one per open dashboard tab and per console tab, opened only while signed in to a shop that has chat.
- **Two API containers and their workers:** a message goes through **Redis pub/sub** (the Redis already running), so
  every process with a listener for that shop delivers it.
- **No database connection is held** by an open socket. A message is written once (one short transaction through
  PgBouncer's pool of 20), then published; an open socket only waits on Redis.
- **At most 3 sockets per person**; a fourth closes the oldest.
- **Cloudflare** carries WebSockets on the current plan; a ping every 25 seconds keeps an idle socket under its
  100-second idle limit. Never cached by the edge or the page cache.
- **A network that blocks WebSockets** falls back to long polling by itself (Socket.IO's own fallback), slower but
  working.
- **A dropped socket** reconnects by itself and fetches what it missed since its last message.
- **Load for 100 sellers on the current VPS** (8 vCPU, 15 GB, PgBouncer 20, Redis 256 MB): about 30 KB of memory per
  open socket, so 100 is about 3 MB; near-zero CPU at rest (a ping every 25 seconds). Even 10 messages per shop per day
  is 1,000 a day, one every 90 seconds. **No VPS upgrade.** For contrast, polling every 5 seconds from 50 open
  dashboards would be 10 requests a second, all day.
- **Flood guard:** messages per person per minute (a setting), and photo size as the existing upload allows.

## 7. Keeping and deleting (LC-8, LC-11)

| Setting | Default | Rule |
|---|---|---|
| `chat_history_days` | 7 | Messages older than this are deleted at the nightly clean-up. Lowering it deletes the older ones at the next clean-up. |
| `chat_photo_days` | 3 | A photo older than this is deleted; its message keeps "ছবি মুছে ফেলা হয়েছে". It can't be set above `chat_history_days`. |

## 8. The AI (LC-14 to LC-18, LC-20, LC-21)

### 8.1 Provider and model (LC-14)

Two settings like the address reader's: `chat_ai_provider` and `chat_ai_model`, the model typed as the provider names
it. **Today Lytro has one AI adapter, Gemini's** (AI-10, D7-4; its key is already on production); another provider
needs its adapter built first. Which provider the chat AI starts on is an open question (§10).

### 8.2 Caution rules

- It answers only from Lytro's answer source (§8.6). If the answer isn't there, it says "একজন মানুষ শিগগিরই উত্তর
  দেবেন" and hands the chat to Lytro.
- Money, refunds, payments, accounts, suspension and anything about one shop's own data always go to a person.
- It sees only the answer source and the chat's last few messages; never the shop's data, never photos. It takes no
  actions.
- Every AI message is labelled; the seller can tap "মানুষের সাথে কথা বলুন", which stops the AI for that chat until
  Lytro answers.
- Lytro sees every AI reply in the chat, with a "ভুল" mark to note a wrong one.

### 8.3 Confident or draft (LC-16)

- **Confident:** sent at once, labelled.
- **Not confident:** a draft in the console. Lytro approves, edits then sends, or discards. The seller sees nothing until
  then; the busy line (§5.5) still applies.
- How confidence is judged is part of the answer method (§8.6).

### 8.4 Cost (LC-17, LC-18)

- `chat_ai_monthly_cap` (in taka or dollars, to settle): this month's spend is shown beside it. At the cap the AI stops
  everywhere until the month turns, and the console says so.
- `chat_ai_replies_per_shop_per_day`: a number, or unlimited. At it, that shop's chat is human-only for the day.
- Each AI reply's cost is recorded, so the spend is exact, not estimated.

### 8.5 Sound for the AI (LC-20, decided)

A chat the AI fully answered makes **no sound** in the console: it shows in the inbox with a quiet count and the AI mark.
The sound plays only when a person is needed: the AI handed over, a draft awaits approval, or the seller asked for a
person.

### 8.6 The AI's knowledge and answer method: to discuss (LC-21)

How the AI knows the platform (its facts, how it answers, how cheaply) is **a separate discussion for later**. The sketch
shows the AI's settings only, with its knowledge source as **one marked placeholder**. It is not designed here and is not
linked to the quick replies (§9). How confidence is judged (LC-16) belongs to that discussion too.

## 9. Quick replies (LC-10)

The operator's own list of short replies, for Lytro's people only; the AI doesn't use it.

- **In the chat:** a "দ্রুত উত্তর" button beside the composer opens the list; tapping one puts its text in the composer,
  to edit or send. It never sends by itself.
- **In the settings:** a simple list: add, edit, delete, and drag to reorder. Each has a short title and its text, in the
  language it's written in. At most 50.

## 10. Open questions

1. **How the AI knows the platform and answers cheaply** (LC-21): a separate discussion for later (§8.6).
2. **The chat AI's provider:** Gemini (adapter and key already there) or another, whose adapter would be built first.
3. **The cap's currency:** taka or dollars.
4. **Hours:** reuse the help line's hours (recommended), or the chat's own.
5. **Messages per person per minute:** 20 recommended.

## 11. The build, after approval

One PR: the server (the feature switches, chat tables, the socket gateway, Redis fan-out, the AI's settings and
switches, the clean-ups), then the dashboard and the console screens to the sketch. The AI's answer path waits for §8.6.
