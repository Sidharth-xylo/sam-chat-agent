from __future__ import annotations

import json
import logging
import os
from typing import Any

from dotenv import load_dotenv

from backend.api_client import ApiClient
from backend.extraction import (
    assistant_text_for_history,
    extract_user_updates,
    generate_message,
    recent_history_for_extraction,
)
from backend.router import route_booking_flow
from backend.state import (
    apply_extracted_updates_to_state,
    apply_picker_event_to_state,
    public_booking_state,
)

load_dotenv()

logger = logging.getLogger(__name__)
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_TURNS", "20"))


# ---------------------------------------------------------------------------
# History helpers
# ---------------------------------------------------------------------------


def trim_history(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep at most MAX_HISTORY_MESSAGES entries, always starting on a user turn."""
    if len(history) <= MAX_HISTORY_MESSAGES:
        return history
    trimmed = history[-MAX_HISTORY_MESSAGES:]
    for i, msg in enumerate(trimmed):
        if msg.get("role") == "user":
            return trimmed[i:]
    return trimmed


def build_history(
    history: list[dict[str, Any]],
    user_message: str,
    reply: dict[str, Any],
) -> list[dict[str, Any]]:
    return [
        *history,
        {"role": "user", "content": user_message},
        {"role": "assistant", "content": json.dumps(reply)},
    ]


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


_EMPTY_EXTRACTION: dict[str, Any] = {
    "intent": "booking",
    "venueQuery": None,
    "sportQuery": None,
    "courtQuery": None,
    "date": None,
    "timeOfDay": None,
    "preferredTime": None,
}


async def run_agent(
    user_message: str,
    history: list[dict[str, Any]] | None = None,
    auth_token: str | None = None,
    user_id: int | None = None,
    booking_state: dict[str, Any] | None = None,
    picker_event: dict[str, Any] | None = None,
) -> dict[str, Any]:
    trimmed_history = trim_history(history or [])
    state = dict(booking_state or {})

    if auth_token and user_id is not None:
        state["loggedIn"] = True
        state["userId"] = user_id

    # --- picker event (machine-generated) vs natural language (user-typed) --
    if picker_event:
        # Structured data from a UI widget — apply directly, no AI needed.
        state = apply_picker_event_to_state(state, picker_event)
        extraction = {
            **_EMPTY_EXTRACTION,
            "intent": "show_venues" if picker_event.get("type") == "show_venues" else "booking",
        }
    else:
        # Natural language — let the LLM extract intent and entities.
        extraction = await extract_user_updates(
            user_message=user_message,
            booking_state=public_booking_state(state),
            history=trimmed_history,
        )
        state = apply_extracted_updates_to_state(state, extraction, user_message)

    logger.info(
        "picker=%s extraction=%s state_before_route=%s",
        picker_event.get("type") if picker_event else None,
        extraction,
        public_booking_state(state),
    )

    # --- route the booking flow ---------------------------------------------
    api_client = ApiClient(auth_token=auth_token, current_user_id=user_id)
    try:
        reply, updated_state = await route_booking_flow(
            state=state,
            extraction=extraction,
            api_client=api_client,
            auth_token=auth_token,
            user_id=user_id,
        )
    finally:
        await api_client.aclose()

    # --- generate a human-sounding message (natural language turns only) ----
    if not picker_event:
        ui_type = reply.get("ui", {}).get("type", "text")
        generated = await generate_message(
            ui_type=ui_type,
            state=public_booking_state(updated_state),
            user_message=user_message,
        )
        if generated:
            reply["message"] = generated

    logger.info(
        "reply ui.type=%s state_after_route=%s",
        reply.get("ui", {}).get("type"),
        public_booking_state(updated_state),
    )

    # Picker events are state mutations, not conversational turns — skip history.
    new_history = (
        trimmed_history
        if picker_event
        else build_history(trimmed_history, user_message, reply)
    )

    return {
        "reply": reply,
        "history": new_history,
        "booking_state": updated_state,
    }