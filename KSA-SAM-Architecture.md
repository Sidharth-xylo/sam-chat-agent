# KSA-SAM — Full System Architecture & File Reference

> A complete technical walkthrough of every file, how they connect,
> and why they were built this way.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Request Lifecycle — Two Paths](#3-request-lifecycle--two-paths)
4. [Backend Files](#4-backend-files)
   - [server.py](#41-serverpy--the-http-entry-point)
   - [agent.py](#42-agentpy--the-brain)
   - [extraction.py](#43-extractionpy--llm-call-1-understand-the-user)
   - [prompt.py](#44-promptpy--what-we-tell-the-llm)
   - [state.py](#45-statepy--booking-state-machine)
   - [router.py](#46-routerpy--booking-flow-fsm)
   - [matchers.py](#47-matcherspy--text-utilities)
   - [api_client.py](#48-api_clientpy--talks-to-the-platform)
5. [Frontend Files](#5-frontend-files)
   - [App.jsx](#51-appjsx--the-shell)
   - [LoginCard.jsx](#52-logincardjsx--auth-gateway)
   - [PaymentCard.jsx](#53-paymentcardjsx--payment--account-creation)
   - [SlotGrid.jsx](#54-slotgridjsx--slot-picker)
   - [VenueGrid / SportGrid / CourtGrid / DatePicker / TimeOfDayPicker](#55-remaining-ui-components)
6. [Key Design Decisions](#6-key-design-decisions)
7. [New User Registration Flow — End to End](#7-new-user-registration-flow--end-to-end)
8. [Existing User Booking Flow — End to End](#8-existing-user-booking-flow--end-to-end)
9. [Booking State Reference](#9-booking-state-reference)
10. [Environment Variables](#10-environment-variables)

---

## 1. System Overview

KSA-SAM is a **conversational sports court booking agent** built on three layers:

| Layer | Technology | Responsibility |
|---|---|---|
| **Frontend** | React (Vite + JSX) | Chat UI, renders interactive booking widgets, handles payments |
| **Chatbot Backend** | Python FastAPI | Understands what the user wants, drives the booking state machine |
| **Platform Backend** | Node.js (external — `sam-be.idzone.app`) | Owns the actual data: venues, sports, slots, users, bookings, payments |

The chatbot backend **never stores bookings** — it only orchestrates. All real data lives in the platform backend.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                    BROWSER                          │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │               React App (App.jsx)           │   │
│  │                                             │   │
│  │  Chat messages + Interactive UI widgets     │   │
│  │  VenueGrid / SportGrid / SlotGrid / etc.    │   │
│  │  LoginCard / PaymentCard                    │   │
│  └──────────────┬──────────────────────────────┘   │
│                 │ POST /chat                        │
│                 │ { message OR pickerEvent }        │
└─────────────────┼───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│            CHATBOT BACKEND (Python FastAPI)         │
│                                                     │
│  server.py      ← HTTP entry point, session store  │
│  agent.py       ← orchestrates the two paths       │
│  extraction.py  ← LLM call 1: understand message   │
│  prompt.py      ← what we tell the LLM             │
│  state.py       ← merge updates into booking state │
│  router.py      ← booking FSM: what to show next   │
│  matchers.py    ← fuzzy text matching utilities    │
│  api_client.py  ← HTTP calls to platform backend   │
└──────────────────────────┬──────────────────────────┘
                           │ REST calls
┌──────────────────────────▼──────────────────────────┐
│         PLATFORM BACKEND (sam-be.idzone.app)        │
│                                                     │
│  /venues          /sports/by-venue                  │
│  /courts/sport/:id  /slots                         │
│  /bookings/book-now  /bookings/verify-payment       │
│  /auth/register    /auth/login                      │
└─────────────────────────────────────────────────────┘
```

---

## 3. Request Lifecycle — Two Paths

Every message from the user hits the same `/chat` endpoint but takes one of two completely different paths inside the agent:

### Path A — Natural Language (user typed something)

```
User types: "book badminton tomorrow evening at 6"
        │
        ▼
POST /chat  { message: "book badminton tomorrow evening at 6" }
        │
        ▼
agent.py  →  extraction.py  →  LLM Call 1 (GPT-4o-mini)
               Extracts: { intent: "booking", sportQuery: "badminton",
                           date: "2026-03-29", timeOfDay: "evening",
                           preferredTime: "18:00" }
        │
        ▼
state.py  →  merge extraction into booking_state
        │
        ▼
router.py  →  decide what UI to show next (venue picker in this case)
        │
        ▼
agent.py  →  extraction.py  →  LLM Call 2 (GPT-4o-mini)
               Generates: "Great choice — pick a venue and we'll lock in that Sunday slot."
        │
        ▼
POST /chat  ← { message: "Great choice...", ui: { type: "venues", data: [...] } }
```

### Path B — Picker Event (user clicked a UI widget)

```
User clicks "Maya Badminton Academy" card
        │
        ▼
POST /chat  { pickerEvent: { type: "venue", venueId: 3, name: "Maya...", sportId: 7 } }
        │
        ▼
agent.py  →  SKIP LLM entirely
        │
        ▼
state.py  →  apply_picker_event_to_state()  ← direct dict merge, deterministic
        │
        ▼
router.py  →  decide what UI to show next (slots, because venue+sport+date+time are all known)
        │
        ▼
POST /chat  ← { message: "Here are the available slots.", ui: { type: "slots", data: {...} } }
             (no LLM generation for picker events — message is hardcoded in router)
```

**Why separate paths?** Natural language is ambiguous and needs AI. A button click is perfectly structured — running it through the LLM would add latency, cost, and risk of misinterpretation.

---

## 4. Backend Files

### 4.1 `server.py` — The HTTP Entry Point

**What it does:** Receives HTTP requests, manages sessions in memory, calls the agent.

```python
sessions: dict[str, SessionState] = {}
# Each session stores: history, booking_state, auth_token, user_id
```

**Key points:**

- **Session management:** Sessions are stored in a plain Python dict keyed by `sessionId` (a UUID generated on the first request). The browser sends `sessionId` back on every subsequent call, so the server can find the right session.

- **`ChatRequest` model:** Accepts either `message` (natural language) or `pickerEvent` (structured widget data). Having them as separate fields is the core architectural decision — it tells the agent which processing path to take.

- **Auth injection:** If the client sends `authToken` + `userId` (after an existing user logs in), they are saved to the session and injected into every subsequent request. This means the user logs in once and subsequent calls automatically carry their identity.

- **Error handling:** Any unhandled exception returns a JSON error response instead of crashing — the chat stays alive even if one message fails.

```python
# The two fields that drive the two processing paths:
class ChatRequest(BaseModel):
    message: str | None = None        # natural language → goes through LLM
    pickerEvent: dict | None = None   # widget click → bypasses LLM entirely
```

---

### 4.2 `agent.py` — The Brain

**What it does:** Orchestrates the entire per-request lifecycle. It's the only file that knows about both the LLM calls and the routing logic.

**The two-path decision:**

```python
if picker_event:
    # Machine-generated, structured — apply directly, no AI needed
    state = apply_picker_event_to_state(state, picker_event)
    extraction = { "intent": "booking", ... all nulls }
else:
    # Human-typed — let the LLM extract intent and entities
    extraction = await extract_user_updates(user_message, ...)
    state = apply_extracted_updates_to_state(state, extraction, user_message)
```

**History management:**

The agent maintains a conversation history list. This history is passed to the extraction LLM as context so it can resolve references like "actually tomorrow" or "same venue as before". Picker events do NOT get added to history — they are state mutations, not conversational turns.

**LLM call 2 (message generation):**

After routing decides what UI to show, a second LLM call generates a single warm, human-sounding sentence. This only runs for natural language turns (not picker events, which have hardcoded messages in the router). If the generation call fails, it gracefully falls back to the router's hardcoded message.

**`_EMPTY_EXTRACTION`:** A clean extraction dict where everything is null except `intent: "booking"`. Used for picker events so the router has a consistent interface regardless of whether input was natural language or a button click.

---

### 4.3 `extraction.py` — LLM Call 1: Understand the User

**What it does:** Sends the user's message to GPT-4o-mini and parses out structured booking fields.

**Two functions:**

1. **`extract_user_updates()`** — the main async LLM call. Sends the extraction prompt + user message to OpenAI. Returns a structured dict with `intent`, `venueQuery`, `sportQuery`, `courtQuery`, `date`, `timeOfDay`, `preferredTime`.

2. **`default_extraction()`** — a pure keyword-based fallback. If the OpenAI call fails (rate limit, timeout, etc.), this simple function scans for booking keywords and returns a best-guess intent. The app degrades gracefully instead of crashing.

**`normalize_extraction()`** — validates and coerces the raw JSON from the LLM. The LLM might return `"preferredTime": "6 pm"` — this function converts it to `"18:00"`. It also validates that `intent` is one of the allowed values, rejects hallucinated field names, and ensures dates are `YYYY-MM-DD` format.

**`recent_history_for_extraction()`** — The history is stored as raw JSON (the full reply object). This function strips it down to just the conversational text for the last 6 turns, so the extraction LLM has context without noise.

**Cost tracking:** Every LLM call logs `prompt tokens`, `completion tokens`, and estimated cost in dollars so usage can be monitored. As seen in your logs: `cost=$0.000115` per extraction call.

---

### 4.4 `prompt.py` — What We Tell the LLM

**What it does:** Builds the two system prompts that are sent to the LLM.

**`build_extraction_prompt()`** — Prompt 1, for understanding user intent:

- Injects today's date and tomorrow's date (so "tomorrow" resolves correctly)
- Injects the current confirmed booking state (so "same venue" can be resolved)
- Injects the last 6 turns of history
- Gives strict rules for each field, especially the tricky ones:
  - `preferredTime` — extract exact clock times ("6 pm" → `"18:00"`)
  - `timeOfDay` — extract broad periods ("evening")
  - `venueQuery` — extract venue names even if embedded ("book at maya" → `"maya"`)
  - `intent` — the key field that drives the router (booking vs show_venues vs discover_sports vs discover_venues)

**`build_generation_prompt()`** — Prompt 2, for writing the human-sounding reply:

- Tells the LLM it is "Sam"
- Tells it exactly what UI is being shown (e.g., "a list of venues")
- Tells it what's confirmed so far
- Strict rules: max 35 words, never mention IDs or prices, never say a time is unavailable when showing venues (the key rule added to fix the "18:00 isn't available" false message)

---

### 4.5 `state.py` — Booking State Machine

**What it does:** Manages how the `booking_state` dict changes in response to inputs.

The `booking_state` is the single source of truth for where a user is in their booking journey. It's a plain Python dict stored in the session.

**Two update functions:**

#### `apply_picker_event_to_state(state, event)` — for widget clicks

Handles each picker event type as a deterministic operation:

| Event type | What it does to state |
|---|---|
| `venue` | Sets `venueId`, `venue`; clears `sportId`, `courtId`, slots if venue changed |
| `sport` | Sets `sportId`, `sport`; clears `courtId`, slots, `_courtsVerified` |
| `court` | Sets `courtId`, `court`; clears slot fields |
| `date` | Sets `date`; clears slot fields |
| `timeOfDay` | Sets `timeOfDay`; clears slot fields and `preferredTime` |
| `slot` | Sets `slotId`, `slotTime`, `slotCourtId`, `slotPrice`; looks up court name from `_slotCourts` |
| `login` | Sets `loggedIn: true`, `userId` |
| `pendingRegistration` | Sets `pendingRegistration: true` + guest details; does NOT set `loggedIn` |

**Why clear downstream fields on changes?** If you change the venue, the sport ID from the old venue is meaningless (sport IDs are venue-scoped). If you change the date, the previously loaded slots are invalid. Clearing downstream keeps the state consistent.

#### `apply_extracted_updates_to_state(state, extraction, user_message)` — for LLM results

Merges LLM-extracted fields into state, with special handling:

- **`sportQuery`**: If the extracted sport is different from the confirmed sport (fuzzy score < 92%), clears all sport-dependent fields. This handles "actually I want tennis instead of badminton."

- **`preferredTime`**: When a clock time like "18:00" is extracted, it **always overrides `timeOfDay`** using `infer_time_of_day()`. This fixes the bug where "evening at 21:00" was stored as `timeOfDay: evening` — 21:00 is night by clock, so `timeOfDay` gets set to `night`.

- **`timeOfDay`**: Only set when no exact clock time was given in the same message. Prevents broad period from overwriting a precise time.

**Helper functions:**

- `infer_time_of_day(HH:MM)` — `04-10 → morning`, `11-15 → afternoon`, `16-19 → evening`, `20+ → night`
- `coerce_preferred_time(value)` — converts "6 pm", "at 5", "18:00" all to `"HH:MM"` 24h format
- `coerce_date(value)` — only accepts `YYYY-MM-DD`, rejects everything else
- `clear_keys(state, keys)` — removes a tuple of keys from state in-place

---

### 4.6 `router.py` — Booking Flow FSM

**What it does:** Given the current `booking_state` and `extraction`, decides what the next step in the booking flow is and what UI to show. This is the heart of the booking logic.

The router is a **Finite State Machine (FSM)** — it walks through the booking requirements in order and returns as soon as it finds the next missing piece.

**The FSM steps in order:**

```
1. Discovery intents (discover_sports, discover_venues) → show sports/venues list
2. show_venues intent → reset venue state → show venue picker (sport-filtered if sport known)
3. venueQuery extraction → fuzzy match against venue list → set venueId or show candidates
4. Ensure venue is set → show venue picker if not
5. sportQuery extraction → fuzzy match against THIS venue's sports → set sportId
6. Ensure sport is set → try to auto-match desiredSportQuery, else show sport picker
7. Courts verification → check sport has courts at this venue (runs once per sport via _courtsVerified)
8. courtQuery extraction (optional) → set courtId if user specified a court
9. Ensure date is set → show DatePicker
10. Ensure timeOfDay is set → show TimeOfDayPicker
11. Ensure slotId is set → fetch and show SlotGrid
12. Login/auth check → show LoginCard (or skip for pendingRegistration)
13. Payment cache check → return cached _paymentData if already created
14. Create booking → use create_booking_as_guest (new users) or create_booking (existing)
15. Return PaymentCard
```

**Key design points:**

- **`desiredSportQuery`** — persists across venue changes. If the user said "badminton" but the first venue didn't have it, this field survives the venue reset so the system can auto-resolve the sport at the new venue without asking again.

- **`_courtsVerified`** — a boolean flag set after the first courts check for a sport. Prevents repeated API calls to `/courts/sport/:id` on every routing pass. Cleared when venue or sport changes.

- **`_pendingVenues / _pendingSports / _pendingSlots`** — cache API results in state. If venues were already fetched for a previous routing pass, reuse them instead of calling the API again.

- **`_slotCourts`** — stores the courts list when slots are shown, so that when the user picks a slot, the court name can be resolved from `slotCourtId`.

- **`_paymentData`** — caches the Razorpay order after `create_booking`. On re-routing (e.g., user types something after seeing the payment screen), the cached data is returned instead of creating a duplicate booking.

- **`pending_registration` path**: When `state["pendingRegistration"]` is true, the login check is bypassed and `create_booking_as_guest()` is called with the guest details stored in state. No real `userId` is needed.

- **No-slots fallback**: When zero slots are found for a date, the router clears the date/time/preferredTime fields and shows the DatePicker again with an explanation — instead of hitting a dead end.

- **Sport not at venue**: When a sport isn't available at the selected venue, the router calls `get_venues_by_sport()` to find venues that do offer it, clears the venue, and shows a filtered venue list.

---

### 4.7 `matchers.py` — Text Utilities

**What it does:** Provides fuzzy string matching and text normalization used by the router when resolving user-typed names against API data.

**`resolve_option(query, options, fields)`:**

The main workhorse. Takes a user query like `"ksa"` and a list of option dicts like `[{venueId:5, name:"KSA", city:"Coimbatore"}]` and tries to find the best match.

Scoring:
- Exact match → 100
- Query is substring of candidate → 92 (e.g., "ksa" in "KSA Coimbatore")
- Candidate is substring of query → 80
- SequenceMatcher ratio → 0-100

Resolution rules:
- Score ≥ 92 with single top match → **resolved** (proceed automatically)
- Score ≥ 85 single match → resolved
- Score ≥ 75 with clear gap from 2nd place → resolved
- Otherwise → return top candidates to show the user

**`option_score(query, candidate)`** — the core scoring function, operates on normalized (lowercase, collapsed whitespace) strings.

**`EXACT_TIME_RE`** — compiled regex that finds clock-style times in natural language. Handles: "6 pm", "at 5", "18:00", "6:30am". Used in `has_exact_time_reference()` which tells `state.py` whether to keep or clear `preferredTime` when a time-of-day word is detected.

**`BOOKING_MARKERS` / `SHOW_VENUES_MARKERS`** — keyword sets used by the `default_extraction()` fallback in `extraction.py`.

---

### 4.8 `api_client.py` — Talks to the Platform

**What it does:** All HTTP calls to `sam-be.idzone.app/api/v2`. The chatbot backend is completely isolated from the platform API shape — if an endpoint changes, only this file needs updating.

**Service token architecture:**

```python
self._service_token = os.getenv("SAM_SERVICE_TOKEN")
self._service_user_id = _decode_service_user_id(self._service_token or "")
```

The service token is a JWT for a dedicated "chatbot service account" in the platform. At init time, the `userId` is decoded directly from the JWT payload (no API call needed). This `userId` is used when booking as a guest — the platform's `createBooking` controller requires a real `userId`, and the service account provides it.

**`_decode_service_user_id(token)`:** Decodes the middle segment of the JWT (base64 URL-encoded JSON payload) without verifying the signature. Signature verification is the platform's job — we just need the claim.

**Key methods:**

| Method | Platform endpoint | Used when |
|---|---|---|
| `get_venues()` | `GET /venues` | Showing venue picker |
| `get_sports_by_venue(venue_id)` | `GET /sports/by-venue?venueId=X` | Showing sport picker or auto-resolving sport |
| `get_courts_by_sport(sport_id)` | `GET /courts/sport/:id` | Courts verification + slot fetching |
| `get_slots(sport_id, venue_id, date, ...)` | `GET /slots?...` (parallel per court) | Showing slot grid |
| `get_venues_by_sport(sport_name)` | Calls `/venues` then `/sports/by-venue` for each | Finding venues that offer a specific sport |
| `create_booking(slot_ids, user_id)` | `POST /bookings/book-now` | Existing user booking |
| `create_booking_as_guest(slot_ids, guest_*)` | `POST /bookings/book-now` with service token | New user booking (pre-registration) |
| `get_all_sports()` | Aggregates all venues' sports | Discover sports intent |

**`get_slots()` internal design:** Fetches courts first, then fires one `/slots` request per court in **parallel** using `asyncio.gather()`. This means 4 courts = 4 simultaneous API calls instead of 4 sequential ones. Also handles auto-selection: if the user specified a `preferredTime` like "18:00", it scans all slots and returns the matching one as `autoSelectedSlot`, bypassing the SlotGrid entirely.

**`strip_base64(value)`:** Recursively walks API responses and replaces base64 image strings with `"[image]"` before logging. Prevents megabytes of image data from flooding logs.

---

## 5. Frontend Files

### 5.1 `App.jsx` — The Shell

**What it does:** The top-level React component. Manages the message list, all booking refs, sends messages to the backend, and renders the right UI widget for each message.

**State vs Refs:**

- `useState` → `msgs` (message list), `input`, `busy`. These trigger re-renders.
- `useRef` → all booking data (`venueRef`, `sportRef`, `courtRef`, `slotRef`, `dateRef`, `courtsRef`, `tokenRef`, `userIdRef`, `userRef`, `pendingRegRef`). These are mutable and don't trigger re-renders — they hold data for sending back to the server or pre-filling UI components.

**`requestAgent(payload)`:**

The central function. Takes either `{ message: "..." }` or `{ pickerEvent: {...} }`, appends the `sessionId`/`authToken`/`userId` from refs, calls `/chat`, and processes the reply. It also extracts key data from the reply to keep the refs in sync (e.g., if the reply contains `venueName`, it updates `venueRef`).

**Auto-follow for venues:**

When the agent returns a plain text response and no venue is selected yet, the app automatically fires a silent `{ pickerEvent: { type: 'show_venues' } }` call. This means the user never sees a text-only response when they should be picking a venue. The `venueAutofollowRef` flag prevents infinite loops.

**`onLogin(token, uid, name, email, pendingReg)`:**

Handles both auth cases:
- **Existing user** (`pendingReg = null`): stores token/uid, sends `{ type: 'login', userId }` picker event
- **New user** (`pendingReg = { name, email, mobile, password, ... }`): stores data in `pendingRegRef`, sends `{ type: 'pendingRegistration', guestName, guestEmail, guestMobile }` picker event. The password is **never sent to the chatbot backend** — it stays in the browser until payment completes.

**Rendering:**

Each message in the list can have a `ui` field. The `tile(condition, component)` helper renders the appropriate widget inline in the chat — VenueGrid, SportGrid, SlotGrid, DatePicker, TimeOfDayPicker, LoginCard, or PaymentCard.

---

### 5.2 `LoginCard.jsx` — Auth Gateway

**What it does:** Presents two tabs — Login (existing users) and Register (new users).

**Login tab:**
- Single identifier field that accepts either email or mobile number
- Password field
- Calls `POST /auth/login` directly to the platform backend
- On success: calls `onLogin(token, uid, name, email)` → normal auth path

**Register tab (the new deferred-registration flow):**
- Required fields: Full Name, Email, Mobile (10 digits), Password (min 6 chars)
- Optional fields: Pin Code, City, State, Country — hidden in a `<details>` element to keep the form clean
- **Critically, no API call is made here.** On "Register & Book", it just calls `onLogin(null, null, name, email, { all form data })` — the registration data is passed up to App.jsx and held in `pendingRegRef`
- A notice below the button: "Your account is created only after payment is confirmed."

**Why no API call in register?**

Calling `/auth/register` here would create the account immediately — before the user has paid. The entire point of the new flow is that the account is only created if payment succeeds. So the form data travels through: `LoginCard → App.jsx (pendingRegRef) → PaymentCard → POST /auth/register` (after Razorpay captures payment).

---

### 5.3 `PaymentCard.jsx` — Payment & Account Creation

**What it does:** Shows the Razorpay payment button, handles the payment flow, and for new users, creates their account and logs them in.

**For existing users:**

```
Pay button → Razorpay modal → user pays
→ POST /bookings/verify-payment with user's auth token
→ Booking confirmed, email sent by platform
→ Show success screen
```

**For new users (pendingRegRef has data):**

```
Pay button → Razorpay modal → user pays
→ POST /auth/register  { name, email, mobile, password, ... }
  (account created NOW — payment was captured, so no risk of ghost accounts)
→ POST /auth/login  { email, password }
  (get real auth token)
→ POST /bookings/verify-payment  { razorpay proof + auth token }
  (booking confirmed, platform sends confirmation email + welcome email)
→ Show success screen
```

**Why register BEFORE verify-payment?**

The `verify-payment` endpoint likely requires authentication. To get an auth token, we need to be registered and logged in first. So the sequence is: register → login → verify. The payment is already captured by Razorpay at this point, so even if register/login fails, the money is captured and support can manually verify.

**Error handling:** The `register` call is wrapped in try/catch and its failure is non-fatal (it might already exist if this is a retry). Only the `login` failure would block the flow.

**Success message:** "Check your email for booking details and login credentials." — The platform's `verifyPayment` controller sends the booking confirmation email automatically; the `register` endpoint sends a welcome email with credentials.

---

### 5.4 `SlotGrid.jsx` — Slot Picker

**What it does:** The most complex UI component. Shows available slots filtered by court and time of day.

**Internal state:**
- `selectedCourt` — which court to filter by (`"all"` or a specific court ID)
- `activePeriod` — which time period tab is active (morning/afternoon/evening/night/all)
- `selectedSlot` — which slot the user has highlighted (not yet booked — booking happens on confirm button)

**Preferred time highlighting:**

If the agent passes `preferredTime: "18:00"`, any slot at 18:00 gets a yellow background border to visually guide the user to their requested time. If that time isn't in the current filter view, a red notice appears.

**Period auto-selection:**

On first render, the component picks the tab that has the most relevance:
1. If `preferredPeriod` is provided and has slots → use it
2. Else → first period that has at least one available slot
3. Else → "All Day"

**`periodForHour(hour)`** uses the same hour boundaries as the backend's `infer_time_of_day()` so the period tabs are always consistent with what the backend calculated.

**Two-step selection:**

Clicking a slot highlights it (local state). The "Book [time]" confirm button only activates after a slot is highlighted. This prevents accidental bookings from a single mis-click.

---

### 5.5 Remaining UI Components

| Component | What it shows | What it sends back |
|---|---|---|
| `VenueGrid` | Cards for each venue with name and city | `{ type: 'venue', venueId, name, sportId?, sportName? }` |
| `SportGrid` | Cards for each sport | `{ type: 'sport', sportId, name }` |
| `CourtGrid` | Cards for each court | `{ type: 'court', courtId, name }` |
| `DatePicker` | Calendar date picker | `{ type: 'date', date: 'YYYY-MM-DD' }` |
| `TimeOfDayPicker` | Morning/Afternoon/Evening/Night buttons | `{ type: 'timeOfDay', period: 'evening' }` |

All of these are "dumb" components — they receive data as props and call `onPick` when the user makes a choice. They have no idea about the booking state or the backend. The intelligence is entirely in the backend router.

**Why does VenueGrid send `sportId` and `sportName`?**

When venues are shown filtered by sport (e.g., "show me badminton venues"), each venue card already knows which sportId that venue offers for that sport. By sending it back with the venue pick, the router can immediately set `sportId` without a separate "pick a sport" step — skipping one entire step in the FSM.

---

## 6. Key Design Decisions

### 6.1 Picker Events vs Natural Language — Two Separate API Fields

The most important architectural decision. Before this, the system tried to parse structured data from generated text strings (e.g., "VENUE_SELECTED: Maya Badminton Academy"). This was fragile — regex broke on edge cases.

**Solution:** `ChatRequest` has two distinct fields:
- `message: str` — user typed something → AI processes it
- `pickerEvent: dict` — user clicked a widget → applied directly, no AI

This means widget interactions are **100% deterministic and never misinterpreted**.

### 6.2 Venue-Scoped Sport IDs

The platform assigns a different sport ID to "Badminton" at each venue. `sportId=7` means Badminton at Maya; `sportId=8` means Badminton at KSA. The chatbot always fetches sports from the currently selected venue — it never caches sport IDs across venues.

### 6.3 `desiredSportQuery` Persistence

When the user says "book badminton", `desiredSportQuery: "badminton"` is stored. This survives venue resets (when user changes venue). After the new venue is selected, the router auto-resolves the sport using `desiredSportQuery` against the new venue's sports list — the user doesn't have to type "badminton" again.

### 6.4 Deferred Account Creation

Ghost accounts (users who register but never pay) are prevented by not calling `/auth/register` until after Razorpay payment is captured. The registration data is held in the browser's `pendingRegRef` until that moment. On the backend, the booking is created using the chatbot service account with `bookedFor: "guest"` — no real user account required.

### 6.5 `_courtsVerified` Flag

Calling `/courts/sport/:id` on every routing pass would mean an API call every time a message is sent after the sport is selected. The `_courtsVerified` flag ensures the courts check runs exactly once per sport selection. It is cleared whenever venue or sport changes.

### 6.6 Two LLM Calls Per Natural Language Turn

- **Call 1 (extraction):** Structured JSON response. Uses `response_format: json_object`. No creativity — pure data extraction. Cost: ~$0.00012 per call.
- **Call 2 (generation):** One short sentence. Bounded by `max_tokens: 60`. Adds warmth and context-awareness. Falls back to the router's hardcoded string if it fails.

Running them separately means each LLM call has a focused, simple job and is much less likely to produce garbage output than if asked to do both at once.

---

## 7. New User Registration Flow — End to End

```
1. User types "book badminton at Maya tomorrow evening at 6"
   → extraction: { intent: booking, sportQuery: badminton, date: 2026-03-29,
                   timeOfDay: evening, preferredTime: 18:00 }
   → state: { desiredSportQuery: badminton, date: ..., timeOfDay: evening, preferredTime: 18:00 }
   → router: no venue → show sport-filtered venue picker (only badminton venues)

2. User clicks "Maya Badminton Academy"
   → pickerEvent: { type: venue, venueId: 3, sportId: 7 }
   → state: { venueId: 3, sportId: 7, sport: Badminton, ... }
   → router: venue+sport+date+time all set → fetch slots → show SlotGrid on Evening tab

3. User clicks "18:00-19:00"
   → pickerEvent: { type: slot, slotId: 4034, time: 18:00-19:00, courtId: 9 }
   → state: { slotId: 4034, slotTime: 18:00-19:00, courtId: 9, ... }
   → router: slot set, not logged in, no pending registration → show LoginCard

4. User fills LoginCard (Register tab): Sidharth T / email / 9087246631 / password123
   → NO API CALL from LoginCard
   → App.jsx onLogin(null, null, "Sidharth T", email, { name, email, mobile, password, ... })
   → pendingRegRef.current = { name, email, mobile, password, ... }
   → pickerEvent sent: { type: pendingRegistration, guestName: Sidharth T,
                         guestEmail: ..., guestMobile: 9087246631 }

5. Backend receives pendingRegistration event
   → state: { pendingRegistration: true, pendingGuestName: Sidharth T,
               pendingGuestEmail: ..., pendingGuestMobile: 9087246631 }
   → router: slotId set + pendingRegistration → skip login gate
   → api_client.create_booking_as_guest(slotIds=[4034], guest_name=..., ...)
       → POST /bookings/book-now  { userId: <service_user_id>, bookedFor: guest,
                                    guestName: ..., guestMobile: ..., guestEmail: ... }
       → Platform creates GuestUser record (NOT a real User account)
       → Platform creates Razorpay order → returns order_SV2SNvrGPROVUJ
   → state: { _paymentData: { razorpayOrderId: ..., keyId: ..., amount: 50000, ... } }
   → reply: { ui: { type: payment, data: { razorpayOrderId: ..., amount: 50000 } } }

6. User sees PaymentCard → clicks Pay ₹500 → Razorpay modal opens

7. User completes payment in Razorpay

8. Razorpay fires success callback with { razorpay_order_id, razorpay_payment_id, razorpay_signature }

9. PaymentCard checks pendingRegRef.current → has data → run registration:
   → POST /auth/register  { name, email, mobile, password, pinCode, city, state, country }
     Platform creates the real User account in DB
   → POST /auth/login  { email, password }
     Platform returns auth token
   → authToken stored in userRef.current.token
   → pendingRegRef.current = null  ← cleared

10. PaymentCard calls:
    → POST /bookings/verify-payment  { razorpay_order_id, razorpay_payment_id,
                                       razorpay_signature, paymentMethod: razorpay }
      Authorization: Bearer <newly obtained auth token>
    → Platform:
        - Marks payment as paid
        - Marks booking as booked
        - Marks slot as booked
        - Sends booking confirmation email to guestEmail ✓
        - Sends welcome email from /auth/register ✓

11. PaymentCard shows success screen:
    "Booking Confirmed! Check your email for booking details and login credentials."
```

---

## 8. Existing User Booking Flow — End to End

```
1-3. Same as above (venue → slots → slot pick → LoginCard shown)

4. User fills LoginCard (Log In tab): email@example.com / password
   → POST /auth/login → returns { token, userId, name }
   → App.jsx onLogin(token, uid, name, email)
   → tokenRef.current = token
   → pickerEvent: { type: login, userId: uid, name }
   → state: { loggedIn: true, userId: uid }

5. Backend receives login event
   → router: slotId set + loggedIn → skip straight to booking
   → api_client.create_booking(slotIds=[4034], userId=uid)
       → POST /bookings/book-now  { userId, slotIds, bookedFor: self }
         Authorization: Bearer <user's token>
   → returns Razorpay order
   → reply: { ui: { type: payment, data: { ... } } }

6. User pays → Razorpay success callback

7. PaymentCard: pendingRegRef.current is null → skip registration
   → POST /bookings/verify-payment with user's existing token
   → Booking confirmed, email sent

8. Success screen shown
```

---

## 9. Booking State Reference

All fields that can appear in `booking_state` at any point:

| Field | Type | Set by | Cleared by |
|---|---|---|---|
| `venueId` | int | venue picker / venue resolution | show_venues, different venue |
| `venue` | str | venue picker | same |
| `sportId` | int | sport picker / auto-resolve | venue change, different sport |
| `sport` | str | sport picker | same |
| `desiredSportQuery` | str | sportQuery extraction / sport picker | (never auto-cleared — persists across venues) |
| `courtId` | int | court picker / slot auto-resolve | sport change |
| `court` | str | court picker / slot lookup | same |
| `date` | YYYY-MM-DD | date picker / extraction | no-slots fallback, slot change |
| `timeOfDay` | morning/afternoon/evening/night | time picker / extraction | no-slots fallback, slot change |
| `preferredTime` | HH:MM | extraction | timeOfDay-only update, slot change |
| `slotId` | int | slot picker | date/time/court change |
| `slotTime` | str | slot picker | same |
| `slotCourtId` | int | slot picker | same |
| `slotPrice` | str | slot picker | same |
| `loggedIn` | bool | login event | (never cleared) |
| `userId` | int | login event | (never cleared) |
| `pendingRegistration` | bool | pendingRegistration event | (persists until session ends) |
| `pendingGuestName` | str | pendingRegistration event | same |
| `pendingGuestEmail` | str | pendingRegistration event | same |
| `pendingGuestMobile` | str | pendingRegistration event | same |
| `_courtsVerified` | bool | courts check | venue/sport change |
| `_pendingVenues` | list | venue fetch | venue picked |
| `_pendingSports` | list | sports fetch | sport picked |
| `_pendingCourts` | list | courts fetch | court picked |
| `_pendingSlots` | list | slots fetch | slot picked |
| `_slotCourts` | list | slots fetch | slot picked |
| `_paymentData` | dict | booking creation | (cached until session ends) |

> Fields prefixed with `_` are internal cache fields. They are never sent to the LLM (filtered out by `public_booking_state()`).

---

## 10. Environment Variables

| Variable | Used in | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | `extraction.py` | GPT-4o-mini API key |
| `OPENAI_MODEL` | `extraction.py` | Model name (default: `gpt-4o-mini`) |
| `SAM_BASE_URL` | `api_client.py` | Platform backend base URL |
| `SAM_SERVICE_TOKEN` | `api_client.py` | JWT for chatbot service account — used for guest bookings and all service GET calls |
| `LOG_LEVEL` | `server.py` | Python logging level (default: INFO) |
| `MAX_HISTORY_TURNS` | `agent.py` | How many history messages to keep (default: 20) |
| `VITE_API_URL` | `App.jsx` (frontend) | URL of the chatbot Python backend |
| `VITE_RAZORPAY_KEY` | `PaymentCard.jsx` (frontend) | Razorpay public key (fallback if not in booking data) |

---

*Document generated for KSA-SAM v2.0 — architecture by the development team.*
