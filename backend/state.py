from __future__ import annotations

import re
from typing import Any

from backend.matchers import (
    EXACT_TIME_RE,
    has_exact_time_reference,
    normalize_text,
    option_score,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TIME_OF_DAY_VALUES = {"morning", "afternoon", "evening", "night"}

# ---------------------------------------------------------------------------
# Low-level helpers
# ---------------------------------------------------------------------------


def clear_keys(state: dict[str, Any], keys: tuple[str, ...]) -> None:
    """Remove keys from state in-place."""
    for key in keys:
        state.pop(key, None)


def public_booking_state(state: dict[str, Any] | None) -> dict[str, Any]:
    """Return only non-None, non-private (no leading _) keys."""
    return {
        key: value
        for key, value in (state or {}).items()
        if value is not None and not str(key).startswith("_")
    }


# ---------------------------------------------------------------------------
# Coercion helpers
# ---------------------------------------------------------------------------


def infer_time_of_day(preferred_time: str | None) -> str | None:
    """Derive morning/afternoon/evening/night from a HH:MM string."""
    if not preferred_time or ":" not in preferred_time:
        return None
    try:
        hour = int(preferred_time.split(":", 1)[0])
    except ValueError:
        return None
    if 4 <= hour < 11:
        return "morning"
    if 11 <= hour < 16:
        return "afternoon"
    if 16 <= hour < 20:
        return "evening"
    return "night"


def coerce_preferred_time(value: Any) -> str | None:
    """Parse any clock-like string into HH:MM (24 h) or return None."""
    if not value:
        return None
    text = str(value).strip().lower()
    match = EXACT_TIME_RE.search(text)
    if not match:
        return None
    if match.group(4) is not None and match.group(5) is not None:
        return f"{int(match.group(4)):02d}:{int(match.group(5)):02d}"

    hour = int(match.group(1))
    minute = int(match.group(2) or "00")
    meridiem = (match.group(3) or "").lower()
    if meridiem == "pm" and hour != 12:
        hour += 12
    if meridiem == "am" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}"


def coerce_date(value: Any) -> str | None:
    """Accept YYYY-MM-DD strings only."""
    text = str(value or "").strip()
    return text if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text) else None


def coerce_time_of_day(value: Any, preferred_time: str | None = None) -> str | None:
    """Normalise to one of the four period strings, falling back to inference."""
    text = normalize_text(str(value or ""))
    if text in TIME_OF_DAY_VALUES:
        return text
    return infer_time_of_day(preferred_time)


# ---------------------------------------------------------------------------
# Structured picker event → state
# ---------------------------------------------------------------------------


def apply_picker_event_to_state(
    state: dict[str, Any], event: dict[str, Any]
) -> dict[str, Any]:
    """
    Apply a structured UI picker event directly to the booking state.
    Events are plain dicts sent from the frontend — no string parsing needed.
    Returns a new state dict (does not mutate the original).
    """
    updated = dict(state)
    event_type = event.get("type")

    if event_type == "venue":
        venue_id = int(event["venueId"])
        if updated.get("venueId") != venue_id:
            clear_keys(
                updated,
                ("sportId", "sport", "courtId", "court", "slotId", "slotTime", "slotCourtId", "_courtsVerified"),
            )
        updated["venueId"] = venue_id
        updated["venue"] = event.get("name")
        if event.get("sportId"):
            updated["sportId"] = int(event["sportId"])
            # sportName is included when venues are shown from a sport-filtered list
            if event.get("sportName"):
                updated["sport"] = event["sportName"]
                updated["desiredSportQuery"] = event["sportName"]
        clear_keys(updated, ("_pendingVenues", "_pendingSports", "_pendingCourts", "_pendingSlots"))

    elif event_type == "sport":
        sport_name = event.get("name")
        if sport_name:
            updated["desiredSportQuery"] = sport_name

        sport_id = event.get("sportId")
        if sport_id is None:
            clear_keys(
                updated,
                (
                    "sportId", "sport",
                    "courtId", "court", "slotId", "slotTime",
                    "slotCourtId", "slotPrice", "_slotCourts", "_paymentData", "_courtsVerified",
                ),
            )
        else:
            sport_id = int(sport_id)
            if updated.get("sportId") != sport_id:
                clear_keys(
                    updated,
                    (
                        "courtId", "court", "slotId", "slotTime",
                        "slotCourtId", "slotPrice", "_slotCourts", "_paymentData", "_courtsVerified",
                    ),
                )
            updated["sportId"] = sport_id
            updated["sport"] = sport_name
        clear_keys(updated, ("_pendingSports", "_pendingCourts", "_pendingSlots"))

    elif event_type == "court":
        court_id = int(event["courtId"])
        if updated.get("courtId") != court_id:
            clear_keys(
                updated,
                ("slotId", "slotTime", "slotCourtId", "slotPrice", "_slotCourts", "_paymentData"),
            )
        updated["courtId"] = court_id
        updated["court"] = event.get("name")
        clear_keys(updated, ("_pendingCourts", "_pendingSlots"))

    elif event_type == "date":
        new_date = event.get("date")
        if updated.get("date") != new_date:
            clear_keys(
                updated,
                ("slotId", "slotTime", "slotCourtId", "slotPrice", "_slotCourts", "_paymentData"),
            )
        updated["date"] = new_date
        clear_keys(updated, ("_pendingSlots", "_paymentData"))

    elif event_type == "timeOfDay":
        new_period = (event.get("period") or "").lower()
        if updated.get("timeOfDay") != new_period:
            clear_keys(
                updated,
                ("slotId", "slotTime", "slotCourtId", "slotPrice", "_slotCourts", "_paymentData"),
            )
        updated["timeOfDay"] = new_period
        updated.pop("preferredTime", None)
        clear_keys(updated, ("_pendingSlots", "_paymentData"))

    elif event_type == "slot":
        slot_id = int(event["slotId"])
        slot_court_id = int(event["courtId"]) if event.get("courtId") is not None else None
        pending_slot = next(
            (s for s in updated.get("_pendingSlots", []) if s.get("id") == slot_id),
            None,
        )
        updated["slotId"] = slot_id
        updated["slotTime"] = pending_slot.get("time") if pending_slot else event.get("time")
        updated["slotCourtId"] = pending_slot.get("courtId") if pending_slot else slot_court_id
        updated["slotPrice"] = (
            pending_slot.get("price") if pending_slot else updated.get("slotPrice")
        )
        matched_court = next(
            (
                c for c in updated.get("_slotCourts", [])
                if c.get("id") == updated.get("slotCourtId")
            ),
            None,
        )
        if matched_court is not None:
            updated["courtId"] = matched_court.get("id")
            updated["court"] = matched_court.get("name")
        clear_keys(updated, ("_pendingSlots", "_paymentData"))

    elif event_type == "login":
        updated["loggedIn"] = True
        if event.get("userId") is not None:
            updated["userId"] = int(event["userId"])

    elif event_type == "pendingRegistration":
        # New user — store guest details for the service-account booking.
        # Account is NOT created yet; that happens in the frontend after payment.
        updated["pendingRegistration"] = True
        updated["pendingGuestName"]    = event.get("guestName")
        updated["pendingGuestEmail"]   = event.get("guestEmail")
        updated["pendingGuestMobile"]  = event.get("guestMobile")
        # Explicitly not logged in
        updated.pop("loggedIn", None)
        updated.pop("userId", None)

    return updated


# ---------------------------------------------------------------------------
# LLM extraction → state
# ---------------------------------------------------------------------------


def apply_extracted_updates_to_state(
    state: dict[str, Any],
    extraction: dict[str, Any],
    user_message: str,
) -> dict[str, Any]:
    """
    Merge LLM-extracted fields into the existing booking state.
    Returns a new state dict.
    """
    updated = dict(state)

    if extraction.get("sportQuery"):
        desired_sport = extraction["sportQuery"]
        updated["desiredSportQuery"] = desired_sport
        if updated.get("sport") and option_score(desired_sport, str(updated.get("sport"))) < 92:
            clear_keys(
                updated,
                (
                    "sportId", "sport", "courtId", "court",
                    "slotId", "slotTime", "slotCourtId", "slotPrice",
                    "_pendingSports", "_pendingCourts", "_pendingSlots",
                    "_slotCourts", "_paymentData", "_courtsVerified",
                ),
            )

    if extraction.get("date") and extraction["date"] != updated.get("date"):
        updated["date"] = extraction["date"]
        clear_keys(
            updated,
            ("slotId", "slotTime", "slotCourtId", "slotPrice", "_slotCourts", "_pendingSlots", "_paymentData"),
        )

    if extraction.get("preferredTime"):
        if extraction["preferredTime"] != updated.get("preferredTime"):
            clear_keys(
                updated,
                ("slotId", "slotTime", "slotCourtId", "slotPrice", "_slotCourts", "_pendingSlots", "_paymentData"),
            )
        updated["preferredTime"] = extraction["preferredTime"]
        # Always infer timeOfDay from the actual clock value so the SlotGrid
        # opens on the correct period tab. Users often say "evening at 21:00"
        # but 21:00 is night — trusting the LLM label causes a mismatch.
        updated["timeOfDay"] = infer_time_of_day(extraction["preferredTime"])

    if extraction.get("timeOfDay"):
        if extraction["timeOfDay"] != updated.get("timeOfDay"):
            clear_keys(
                updated,
                ("slotId", "slotTime", "slotCourtId", "slotPrice", "_slotCourts", "_pendingSlots", "_paymentData"),
            )
        updated["timeOfDay"] = extraction["timeOfDay"]
        if not has_exact_time_reference(user_message):
            updated.pop("preferredTime", None)

    return updated
