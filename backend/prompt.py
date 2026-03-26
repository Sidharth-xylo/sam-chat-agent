from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any


def _public_state(booking_state: dict[str, Any] | None = None) -> dict[str, Any]:
    if not booking_state:
        return {}
    return {
        key: value
        for key, value in booking_state.items()
        if value is not None and not str(key).startswith("_")
    }


# ---------------------------------------------------------------------------
# Extraction prompt  (LLM call 1 — intent + entity extraction)
# ---------------------------------------------------------------------------


def build_extraction_prompt(
    booking_state: dict[str, Any] | None = None,
    recent_history: list[dict[str, str]] | None = None,
) -> str:
    today = date.today().isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    confirmed = _public_state(booking_state)

    history_lines = []
    for item in recent_history or []:
        role = item.get("role", "user")
        content = (item.get("content") or "").strip()
        if content:
            history_lines.append(f"{role}: {content}")
    history_block = "\n".join(history_lines[-6:]) or "(none)"
    state_block = json.dumps(confirmed) if confirmed else "{}"

    return f"""You extract booking details for a sports court booking assistant.
Today: {today}
Tomorrow: {tomorrow}

Confirmed booking state:
{state_block}

Recent chat context:
{history_block}

Return exactly one JSON object with these keys:
{{
  "intent": "booking|show_venues|discover_sports|discover_venues|general|unknown",
  "venueQuery": null,
  "sportQuery": null,
  "courtQuery": null,
  "date": null,
  "timeOfDay": null,
  "preferredTime": null
}}

Rules:
- Extract only what the latest user message adds or changes.
- Use confirmed state and recent context only to resolve references like "same venue", "actually tomorrow", or "that one".
- Never invent IDs.
- Resolve relative dates immediately:
  - today -> {today}
  - tomorrow -> {tomorrow}
- If the user gives a specific time like "6 pm", "at 5", "18:00", set preferredTime to HH:MM in 24h and also set timeOfDay.
- If the user gives only a broad period like morning/afternoon/evening/night, set only timeOfDay.
- venueQuery: extract any venue name or shorthand the user mentions, even if mixed into a sentence (e.g. "in ksa" → venueQuery="ksa", "at maya" → venueQuery="maya", "book at coimbatore" → venueQuery="coimbatore"). Include partial names.
- sportQuery, courtQuery: same — extract names even if embedded in a sentence.
- Use intent="show_venues" when the user asks to see, pick, change, or switch venues — including phrases like "change the venue", "different venue", "another venue", "switch venue", "show venues", "pick a venue".
- Use intent="discover_sports" for questions like "what sports do you have?"
- Use intent="discover_venues" for questions like "where can I play badminton?"
- Use intent="booking" for booking requests, providing booking details, or messages that add/change specific fields (sport, date, time, court).
- If a field is not mentioned in the latest user message, leave it null.
- Return only valid JSON with double quotes.
""".strip()


# ---------------------------------------------------------------------------
# Generation prompt  (LLM call 2 — write the conversational message field)
# ---------------------------------------------------------------------------


def build_generation_prompt(ui_type: str, state: dict[str, Any]) -> str:
    """
    Prompt for the lightweight response-generation pass.
    The model's only job is to write one warm sentence that acknowledges what
    the user said and bridges naturally to the UI being shown.
    """
    confirmed = _public_state(state)
    state_summary = json.dumps(confirmed) if confirmed else "{}"

    ui_descriptions = {
        "venues":     "a list of venues for the user to pick from",
        "sports":     "a list of sports available at the chosen venue",
        "datepicker": "a date picker",
        "timeofday":  "a time-of-day selector (morning / afternoon / evening / night)",
        "slots":      "available court slots for the chosen date and time",
        "login":      "a login prompt so the user can confirm their booking",
        "payment":    "a payment screen to finalise the booking",
        "text":       "a plain text response (no interactive UI)",
    }
    ui_label = ui_descriptions.get(ui_type, ui_type)

    return f"""You are Sam, a friendly sports court booking assistant.
Write exactly ONE short, warm, conversational sentence (max 35 words).

What the UI is now showing: {ui_label}
Confirmed booking so far: {state_summary}

Rules:
- Acknowledge or briefly react to what the user just said.
- Then naturally lead into the UI being shown — do not describe the UI literally.
- Never repeat confirmed details as a list.
- Never include IDs, prices, or slot times — the UI shows those.
- Never ask for something already confirmed.
- Sound like a helpful human, not a template.
- When ui_type=sports, ALWAYS guide the user to pick a sport. Never ask them to provide venue, date, time, or any other detail — sport is chosen first.
- NEVER say a time or slot "isn't available" when showing venues — availability is unknown until a venue and date are confirmed. Venues are shown to collect a venue choice, not because the time failed.
- When ui_type=venues, ALWAYS guide the user to pick a venue. Never ask them to provide sport, date, or any other detail — those come after the venue is chosen.

Examples for ui_type=slots:
  User said "book badminton tomorrow evening at 6"
  -> "18:00 isn't free, but here are the closest evening options."

  User said "show me slots"
  -> "Here are the available slots for your session."

Examples for ui_type=sports:
  User said "I want to book a slot"
  -> "Great! First, pick a sport you'd like to play."

  User said "can you help me book"
  -> "I'd love to help. What sport interests you?"

Examples for ui_type=venues:
  User said "I want to book a slot"
  -> "Sure! Pick a venue to get started."

  User said "book badminton sunday evening at 6"
  -> "Great choice — pick a venue and we'll lock in that Sunday slot."

  User said "I want to play tennis"
  -> "Sure, pick a venue and we'll get you on a court."
""".strip()