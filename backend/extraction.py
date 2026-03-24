from __future__ import annotations

import json
import logging
import os
from typing import Any

from openai import AsyncOpenAI

from backend.matchers import (
    BOOKING_MARKERS,
    SHOW_VENUES_MARKERS,
    has_exact_time_reference,
    normalize_text,
)
from backend.prompt import build_extraction_prompt, build_generation_prompt
from backend.state import coerce_date, coerce_preferred_time, coerce_time_of_day

logger = logging.getLogger(__name__)

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_CLIENT = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ---------------------------------------------------------------------------
# Token logging
# ---------------------------------------------------------------------------


def log_tokens(usage: Any, label: str = "") -> None:
    if not usage:
        return
    prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
    completion_tokens = getattr(usage, "completion_tokens", 0) or 0
    cost = (prompt_tokens / 1_000_000 * 0.15) + (completion_tokens / 1_000_000 * 0.60)
    logger.info(
        "tokens [%s] prompt=%s completion=%s cost=$%.6f",
        label or "?",
        prompt_tokens,
        completion_tokens,
        cost,
    )


# ---------------------------------------------------------------------------
# History formatting helpers
# ---------------------------------------------------------------------------


def assistant_text_for_history(message: dict[str, Any]) -> str:
    """Extract just the conversational message text from a stored assistant reply."""
    content = str(message.get("content") or "").strip()
    if not content:
        return ""
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        return content
    if isinstance(payload, dict):
        return str(payload.get("message") or "").strip()
    return content


def recent_history_for_extraction(
    history: list[dict[str, Any]],
) -> list[dict[str, str]]:
    """Return the last 6 user/assistant turns as plain text pairs."""
    items: list[dict[str, str]] = []
    for message in history:
        role = message.get("role")
        if role not in {"user", "assistant"}:
            continue
        content = (
            str(message.get("content") or "").strip()
            if role == "user"
            else assistant_text_for_history(message)
        )
        if content:
            items.append({"role": str(role), "content": content})
    return items[-6:]


# ---------------------------------------------------------------------------
# Extraction — LLM call 1
# ---------------------------------------------------------------------------


def default_extraction(user_message: str) -> dict[str, Any]:
    """Keyword-only fallback when the LLM call fails."""
    text = normalize_text(user_message)
    intent = "unknown"
    if any(marker in text for marker in SHOW_VENUES_MARKERS):
        intent = "show_venues"
    elif "what sports" in text or "which sports" in text or "sports do you" in text:
        intent = "discover_sports"
    elif "where can i play" in text or "which venue" in text or "venues for" in text:
        intent = "discover_venues"
    elif any(marker in text for marker in BOOKING_MARKERS) or has_exact_time_reference(user_message):
        intent = "booking"
    return {
        "intent": intent,
        "venueQuery": None,
        "sportQuery": None,
        "courtQuery": None,
        "date": None,
        "timeOfDay": None,
        "preferredTime": None,
    }


def normalize_extraction(payload: Any, user_message: str) -> dict[str, Any]:
    """Validate and coerce the raw JSON returned by the extraction LLM."""
    fallback = default_extraction(user_message)
    if not isinstance(payload, dict):
        return fallback

    intent = str(payload.get("intent") or fallback["intent"]).strip().lower()
    if intent not in {
        "booking",
        "show_venues",
        "discover_sports",
        "discover_venues",
        "general",
        "unknown",
    }:
        intent = fallback["intent"]

    preferred_time = coerce_preferred_time(payload.get("preferredTime"))
    time_of_day = coerce_time_of_day(payload.get("timeOfDay"), preferred_time)

    return {
        "intent": intent,
        "venueQuery": str(payload.get("venueQuery") or "").strip() or None,
        "sportQuery": str(payload.get("sportQuery") or "").strip() or None,
        "courtQuery": str(payload.get("courtQuery") or "").strip() or None,
        "date": coerce_date(payload.get("date")),
        "timeOfDay": time_of_day,
        "preferredTime": preferred_time,
    }


async def extract_user_updates(
    user_message: str,
    booking_state: dict[str, Any],
    history: list[dict[str, Any]],
) -> dict[str, Any]:
    """Call the LLM to extract intent and entities from the user's message."""
    prompt = build_extraction_prompt(
        booking_state=booking_state,
        recent_history=recent_history_for_extraction(history),
    )
    try:
        response = await OPENAI_CLIENT.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_message},
            ],
            response_format={"type": "json_object"},
        )
        log_tokens(response.usage, label="extract")
        content = response.choices[0].message.content or "{}"
        logger.info("extract content=%s", content[:300])
        return normalize_extraction(json.loads(content), user_message)
    except Exception as exc:
        logger.warning("extract_user_updates fallback: %s", exc)
        return default_extraction(user_message)


# ---------------------------------------------------------------------------
# Generation — LLM call 2
# ---------------------------------------------------------------------------


async def generate_message(
    ui_type: str,
    state: dict[str, Any],
    user_message: str,
) -> str:
    """
    Write a single conversational sentence for the reply's message field.
    Returns an empty string on failure so the caller can fall back to its
    hardcoded string.
    """
    prompt = build_generation_prompt(ui_type=ui_type, state=state)
    try:
        response = await OPENAI_CLIENT.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_message},
            ],
            max_tokens=60,
        )
        log_tokens(response.usage, label="generate")
        return (response.choices[0].message.content or "").strip()
    except Exception as exc:
        logger.warning("generate_message fallback: %s", exc)
        return ""